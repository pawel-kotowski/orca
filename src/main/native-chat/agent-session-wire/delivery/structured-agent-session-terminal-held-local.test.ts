import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ path: '' }))
vi.mock('../../../../shared/app-lifecycle/app-environment', async (original) => ({
  ...(await original<object>()),
  getAppEnvironment: () => ({ getPath: () => dir.path })
}))

import {
  beginStructuredChatTerminalHold,
  releaseStructuredChatTerminalHold,
  resetStructuredChatTerminalHoldsForTests
} from '../../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import {
  HOST_TEST_SESSION as SESSION,
  hostTestMessage,
  hostTestOperationId
} from '../host/testing/structured-agent-session-host-test-data.test-fixture'
import {
  createQueuedMessageTestRig,
  type QueuedMessageTestRig
} from '../host/testing/structured-agent-session-queued-message-rig.test-fixture'
import { eventually } from '../host/testing/structured-agent-session-queued-message-rig-provider.test-fixture'

// H4: a message or an automation sent while a terminal has the chat waits, and goes once it is back.
let rig: QueuedMessageTestRig

beforeEach(async () => {
  dir.path = mkdtempSync(join(tmpdir(), 'terminal-held-'))
  resetStructuredChatTerminalHoldsForTests()
  rig = await createQueuedMessageTestRig()
})
afterEach(async () => {
  await rig.dispose()
  resetStructuredChatTerminalHoldsForTests()
  rmSync(dir.path, { recursive: true, force: true })
})

const hold = () =>
  beginStructuredChatTerminalHold(SESSION, {
    token: 't',
    id: 'i',
    agent: 'codex',
    conversationId: 'c'
  })

async function giveBack(): Promise<void> {
  releaseStructuredChatTerminalHold(SESSION, 't')
  await rig.host.wakeReturnedSession(SESSION)
}

const submissionInput = () => ({
  envelope: hostTestOperationId(),
  body: hostTestMessage('accepted as it went')
})

async function sentWhileHeld(text: string, internal?: true): Promise<string> {
  const result = await rig.send(text, 'queue-if-active', internal ? { internal } : undefined).result
  if (!result.ok || !('queued' in result.value)) {
    throw new Error(`expected a waiting card, got ${JSON.stringify(result)}`)
  }
  return result.value.queued.messageId
}

it('keeps what comes meanwhile as cards and sends it once the chat is back', async () => {
  hold()
  const mine = await sentWhileHeld('from the phone')
  const automation = await sentWhileHeld('the automation', true)
  rig.host.wakeQueuedMessages(SESSION)
  await rig.host.serialize(SESSION, async () => {})
  expect((await rig.drafts()).map(({ messageId, state }) => [messageId, state])).toEqual([
    [mine, 'waiting'],
    [automation, 'waiting']
  ])
  expect(rig.dispatch).not.toHaveBeenCalled()
  expect(await rig.sendNow(mine)).toMatchObject({ ok: false })

  await giveBack()
  await eventually(async () => expect((await rig.handoff(mine))?.handedOverAt).toBeDefined())
  await rig.settleAccepted(await rig.handoffId(mine), 'one')
})

it('delivers it after an Orca restart too, though nobody opened the chat', async () => {
  hold()
  const automation = await sentWhileHeld('the automation', true)
  const mine = await sentWhileHeld('from the phone')
  await rig.quitRestartHostProcess()
  resetStructuredChatTerminalHoldsForTests()

  await giveBack()
  await eventually(async () => expect(await rig.handoff(automation)).toBeDefined())
  expect((await rig.handoff(automation))?.dispatchState).not.toBe('rejected')
  expect((await rig.drafts()).find((draft) => draft.messageId === mine)).not.toMatchObject({
    paused: true
  })
})

it('starts no agent for a message accepted as the chat was handed over', async () => {
  await rig.host
    .collaboratorsForTests()
    .lifetime.stopAgent(SESSION, { cause: 'evict', resting: true })
  expect(rig.host.loadedSessionIds()).not.toContain(SESSION)
  const starts = rig.starts.mock.calls.length
  let id = ''
  // Accepted before the hold, delivered after: the loop runs in the same lane once this returns.
  await rig.host.serialize(SESSION, async () => {
    const journal = rig.host.collaboratorsForTests().sessions.get(SESSION)!.journal
    const { envelope, body } = submissionInput()
    id = envelope
    await journal.appendSubmission({
      clientMessageId: id,
      origin: 'client',
      payloadFingerprint: 'f',
      body,
      fence: 1,
      handoverRecorded: true
    })
    hold()
  })
  // Resolves once delivery parks.
  await rig.host.collaboratorsForTests().conversationDelivery.loop.wake(SESSION)
  expect(rig.starts.mock.calls.length).toBe(starts)
  expect(await rig.submission(id)).not.toMatchObject({ dispatchState: 'rejected' })

  // The rig's provider cannot resume; that a start is asked for is what the hold kept back.
  await giveBack()
  await eventually(async () => expect(rig.starts.mock.calls.length).toBe(starts + 1))
})
