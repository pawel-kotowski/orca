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
  resetStructuredChatTerminalHoldsForTests,
  structuredChatTerminalHold
} from '../../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import type { AgentMessageSource } from '../../../../shared/agent-session/journal/agent-session-message-source'
import { agentSessionFailureFact } from '../../../../shared/agent-session/failures/agent-session-failure'
import { agentSessionFailureWords } from '../../../../shared/agent-session/failures/agent-session-failure-words'
import {
  agentJournalItemKey,
  agentJournalSubmissionKey
} from '../../../../shared/agent-session/journal/agent-session-journal-item-key'
import { AGENT_JOURNAL_THREAD_SCOPE } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import {
  HOST_TEST_NOW,
  HOST_TEST_SESSION as SESSION,
  HOST_TEST_THREAD as THREAD,
  hostTestMessage,
  hostTestOperationId
} from '../host/testing/structured-agent-session-host-test-data.test-fixture'
import { agentSessionConversationCommandFields } from '../../../../shared/agent-session/conversation-context/agent-session-conversation-command'
import {
  createQueuedMessageTestRig,
  QUEUED_RIG_CALLER,
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

async function giveBack() {
  const waiting = structuredChatTerminalHold(SESSION)?.waiting ?? []
  releaseStructuredChatTerminalHold(SESSION, 't')
  return rig.host.wakeReturnedSession(SESSION, { waiting, ran: true })
}

async function restart(): Promise<void> {
  await rig.quitRestartHostProcess()
  resetStructuredChatTerminalHoldsForTests()
  show()
}

/** The rig's chat has no tab; the person sees one. */
function show(shown = true): void {
  vi.spyOn(rig.store, 'isSessionTabVisible').mockReturnValue(shown)
  vi.spyOn(rig.store, 'isSessionInBackground').mockReturnValue(false)
}

async function turn(
  id: string,
  state: 'running' | 'completed' | 'interrupted',
  outcome?: 'failure'
) {
  const journal = rig.host.collaboratorsForTests().sessions.get(SESSION)!.journal
  await journal.appendItem(
    { provider: 'codex', threadId: THREAD, turnId: `turn-of-${id}`, ordinal: 0 },
    {
      kind: 'turn',
      turnId: `turn-of-${id}`,
      startedAt: HOST_TEST_NOW,
      userItemId: agentJournalSubmissionKey(id),
      ...(outcome ? { outcome } : {}),
      ...(state === 'running' ? { state } : { state, completedAt: HOST_TEST_NOW })
    },
    { fence: 1, turnScope: AGENT_JOURNAL_THREAD_SCOPE }
  )
}

/** A turn that ended before the chat was handed over. */
async function endedTurn(how: 'done' | 'failed' | 'stopped'): Promise<void> {
  const id = await rig.workingSend()
  await rig.settleAccepted(id, 'working')
  await turn(id, 'running')
  if (how === 'stopped') {
    await rig.stop()
    await turn(id, 'interrupted')
  } else {
    await turn(id, 'completed', how === 'failed' ? 'failure' : undefined)
  }
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

const CASES = (['done', 'failed', 'stopped'] as const).flatMap((how) =>
  [false, true].flatMap((restarts) =>
    ([undefined, true] as const).map((automation) => ({ how, restarts, automation }))
  )
)

it.each(CASES)(
  'after a turn that was $how (restart: $restarts, automation: $automation) it goes out',
  async ({ how, restarts, automation }) => {
    await endedTurn(how)
    show()
    hold()
    const id = await sentWhileHeld('meanwhile', automation)
    if (restarts) {
      await restart()
    }
    await giveBack()
    await eventually(async () => expect(await rig.handoff(id)).toBeDefined())
    expect((await rig.handoff(id))?.dispatchState).not.toBe('rejected')
  }
)

const TASK = {
  kind: 'agent',
  senders: [],
  orchestration: { message: 'task', taskId: 't', dispatchId: 'd' }
} as never as AgentMessageSource

it.each([
  ['done', true],
  ['failed', false],
  ['failed', true]
] as const)('a dispatched task goes out too (turn %s, restart %s)', async (how, restarts) => {
  await endedTurn(how)
  show()
  hold()
  const result = await rig.send('the task', 'queue-if-active', { internal: true, from: TASK })
    .result
  if (!result.ok || !('queued' in result.value)) {
    throw new Error('expected a waiting card')
  }
  const { messageId } = result.value.queued
  if (restarts) {
    await restart()
  }
  await giveBack()
  await eventually(async () => expect(await rig.handoff(messageId)).toBeDefined())
})

async function usageLimit(resetsAt?: number): Promise<void> {
  const id = await rig.workingSend()
  await rig.settleAccepted(id, 'working')
  await turn(id, 'running')
  await turn(id, 'completed', 'failure')
  const journal = rig.host.collaboratorsForTests().sessions.get(SESSION)!.journal
  await journal.appendItem(
    { provider: 'orca', clientMessageId: 'limited-limit' },
    {
      kind: 'status',
      ...agentSessionFailureWords(
        agentSessionFailureFact('usageLimitReached', {
          usageLimit: resetsAt === undefined ? {} : { resetsAt }
        }),
        { surface: 'row' }
      )
    },
    {
      fence: 1,
      turnScope: {
        kind: 'turn',
        turnItemId: agentJournalItemKey({
          provider: 'codex',
          threadId: THREAD,
          turnId: `turn-of-${id}`,
          ordinal: 0
        })
      }
    }
  )
}

it('a usage limit the conversation went past in the terminal holds nothing more', async () => {
  await usageLimit(HOST_TEST_NOW + 60_000)
  show()
  hold()
  const result = await rig.send('the task', 'queue-if-active', { internal: true, from: TASK })
    .result
  if (!result.ok || !('queued' in result.value)) {
    throw new Error('expected a waiting card')
  }
  const { messageId } = result.value.queued
  await giveBack()
  await eventually(async () => expect(await rig.handoff(messageId)).toBeDefined())
})

it.each([HOST_TEST_NOW + 60_000, undefined])(
  'a usage limit (reset %s) the conversation went past gets no Continue',
  async (resetsAt) => {
    await usageLimit(resetsAt)
    show()
    hold()
    const cancel = vi.spyOn(rig.store, 'cancelUsageLimitContinue')
    await giveBack()
    expect(cancel).toHaveBeenCalledOnce()
    expect(rig.store.getRecord(SESSION)?.usageLimitContinueCancel?.turnItemId).toBe(
      cancel.mock.calls[0][1].turnItemId
    )
  }
)

it('frees a limited queue for mail, which is redriven after the hold', async () => {
  await usageLimit(HOST_TEST_NOW + 60_000)
  show()
  hold()
  await giveBack()
  const journal = rig.host.collaboratorsForTests().sessions.get(SESSION)!.journal
  expect(await journal.queuedMessages.pauses()).toEqual([])
})

it("a person's message behind an automation's goes out after a restart too", async () => {
  await endedTurn('done')
  show()
  hold()
  const automation = await sentWhileHeld('the automation', true)
  const mine = await sentWhileHeld('mine')
  const waiting = structuredChatTerminalHold(SESSION)!.waiting
  expect(waiting).toEqual([automation, mine])
  await restart()
  expect(await giveBack()).toBe('sent')
  const journal = rig.host.collaboratorsForTests().sessions.get(SESSION)!.journal
  await eventually(async () => expect(await rig.handoff(automation)).toBeDefined())
  // The rig's provider cannot resume; what matters is that the automation's turn freed nothing of mine.
  expect((await journal.queuedMessages.get(mine))?.state).toBe('waiting')
  vi.spyOn(journal.queuedMessages, 'pauses').mockResolvedValue(
    (await journal.queuedMessages.pauses()).filter(({ reason }) => reason === 'restarted')
  )
  await eventually(async () => {
    const again = await rig.host.wakeReturnedSession(SESSION, { waiting, ran: true, sent: true })
    expect(again).toBe('sent')
  })
  expect(await rig.handoff(mine)).toBeDefined()
})

it('leaves a card the person stopped over alone, though a restart holds it too', async () => {
  await endedTurn('done')
  show()
  hold()
  const id = await sentWhileHeld('meanwhile')
  const waiting = structuredChatTerminalHold(SESSION)!.waiting
  await restart()
  const { journal } = await rig.host.conversation(SESSION)
  const at = (await journal.queuedMessages.get(id))!.queuedAt!
  const stopped = { reason: 'stopped', since: { ...at, sequence: at.sequence + 1 } } as never
  vi.spyOn(journal.queuedMessages, 'pauses').mockResolvedValue([
    stopped,
    ...(await journal.queuedMessages.pauses())
  ])
  releaseStructuredChatTerminalHold(SESSION, 't')
  expect(await rig.host.wakeReturnedSession(SESSION, { waiting, ran: true })).toBe('done')
  expect(await rig.handoff(id)).toBeUndefined()
})

it('leaves a chat the person closed alone', async () => {
  await endedTurn('failed')
  hold()
  const id = await sentWhileHeld('meanwhile', true)
  await restart()
  show(false)
  await giveBack()
  await rig.host.serialize(SESSION, async () => {})
  expect(await rig.handoff(id)).toBeUndefined()
})

it('refuses /clear, which would leave the terminal a conversation the chat no longer has', async () => {
  hold()
  const result = await rig.host.conversationCommand(QUEUED_RIG_CALLER, {
    command: 'clear',
    envelope: rig.envelope(
      agentSessionConversationCommandFields('clear'),
      'agentSession.conversationCommand',
      hostTestOperationId()
    )
  })
  expect(result.ok).toBe(false)
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
