import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ host: null as object | null, blockedEarly: true }))
vi.mock('../host/structured-agent-session-registry', async (original) => ({
  ...(await original<object>()),
  getStructuredAgentSessionHost: () => mocks.host
}))
vi.mock('./structured-conversation-command-admission', async (original) => {
  const actual = await original<typeof Admission>()
  return {
    ...actual,
    conversationCommandBlocked: async (
      ...args: Parameters<typeof actual.conversationCommandBlocked>
    ) => (mocks.blockedEarly ? actual.conversationCommandBlocked(...args) : null)
  }
})

import { structuredIdleCompactionTarget } from '../../../agent-hooks/idle-compaction/idle-compaction-structured-chat'
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
  HOST_TEST_THREAD as THREAD
} from '../host/testing/structured-agent-session-host-test-data.test-fixture'
import {
  createQueuedMessageTestRig,
  type QueuedMessageTestRig
} from '../host/testing/structured-agent-session-queued-message-rig.test-fixture'
import { eventually } from '../host/testing/structured-agent-session-queued-message-rig-provider.test-fixture'
import type * as Admission from './structured-conversation-command-admission'

// Idle compaction is no one's message: it ends no pause, sends no card and queues nothing.
let rig: QueuedMessageTestRig
const accountUsage = vi.fn()

beforeEach(async () => {
  mocks.blockedEarly = true
  accountUsage.mockReset().mockResolvedValue(undefined)
  rig = await createQueuedMessageTestRig({
    usageLimitAutoContinue: {
      isEnabled: () => false,
      subscribe: () => () => {},
      isWorkspaceAsleep: () => false,
      accountUsage
    }
  })
  mocks.host = rig.host
})
afterEach(() => rig.dispose())

const journal = () => rig.host.collaboratorsForTests().sessions.get(SESSION)!.journal
const compact = () => {
  mocks.host = rig.host
  return structuredIdleCompactionTarget.compact({ sessionId: SESSION, providerSessionId: THREAD })
}

async function turn(id: string, outcome: 'done' | 'failure' | 'interrupted' | null) {
  await journal().appendItem(
    { provider: 'codex', threadId: THREAD, turnId: `turn-of-${id}`, ordinal: 0 },
    {
      kind: 'turn',
      turnId: `turn-of-${id}`,
      startedAt: HOST_TEST_NOW,
      userItemId: agentJournalSubmissionKey(id),
      ...(outcome === null
        ? { state: 'running' as const }
        : {
            state: outcome === 'interrupted' ? ('interrupted' as const) : ('completed' as const),
            completedAt: HOST_TEST_NOW,
            ...(outcome === 'failure' ? { outcome: 'failure' as const } : {})
          })
    },
    { fence: 1, turnScope: AGENT_JOURNAL_THREAD_SCOPE }
  )
}

/** A turn, a card that came during it, and how the turn ended. */
async function chat(
  ended: 'done' | 'stopped' | 'failed' | 'limited' | 'running',
  card: boolean
): Promise<void> {
  const id = await rig.workingSend()
  await rig.settleAccepted(id, 'working')
  await turn(id, null)
  if (card) {
    expect(await rig.send('the follow-up', 'queue-if-active').result).toMatchObject({
      value: { queued: {} }
    })
  }
  if (ended === 'running') {
    return
  }
  if (ended === 'stopped') {
    await rig.stop()
  }
  await turn(id, ended === 'done' ? 'done' : ended === 'stopped' ? 'interrupted' : 'failure')
  if (ended === 'limited') {
    await journal().appendItem(
      { provider: 'orca', clientMessageId: 'limited' },
      {
        kind: 'status',
        ...agentSessionFailureWords(
          agentSessionFailureFact('usageLimitReached', {
            usageLimit: { resetsAt: HOST_TEST_NOW + 60_000 }
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
}

async function refused(): Promise<void> {
  const before = [await rig.drafts(), await rig.queuePause(), rig.dispatch.mock.calls.length]
  for (const early of [true, false]) {
    mocks.blockedEarly = early
    expect(await compact()).toBe(false)
  }
  await rig.host.serialize(SESSION, async () => {})
  expect([await rig.drafts(), await rig.queuePause(), rig.dispatch.mock.calls.length]).toEqual(
    before
  )
  expect(rig.compact).not.toHaveBeenCalled()
}

it('compacts a chat at rest, as no message of a person', async () => {
  await chat('done', false)
  expect(await compact()).toBe(true)
  await eventually(() => expect(rig.compact).toHaveBeenCalledOnce())
  const { clientMessageId } = rig.compact.mock.calls[0][0].command
  const sent = await rig.submission(clientMessageId)
  expect(sent).toMatchObject({ origin: 'host' })
  expect(sent?.source).toBeUndefined()
})

it.each([
  ['stopped', true],
  ['stopped', false],
  ['failed', true],
  ['failed', false],
  ['limited', true],
  ['limited', false]
] as const)(
  'a chat that was %s (card waiting: %s) keeps its pause and its card',
  async (how, card) => {
    await chat(how, card)
    await refused()
  }
)

it('a card that waits out an Orca restart still waits', async () => {
  await chat('running', true)
  await rig.quitRestartHostProcess()
  await rig.drafts()
  expect(await journal().queuedMessages.pauses()).toMatchObject([{ reason: 'restarted' }])
  await refused()
})

it('a running turn refuses it; nothing is queued behind it', async () => {
  await chat('running', false)
  await refused()
})

it('a usage limit the person resumed the queue past still refuses it', async () => {
  await chat('limited', true)
  await rig.deleteQueued((await rig.drafts())[0]!.messageId)
  await journal().appendQueueResume(1)
  expect(await rig.queuePause()).toBeNull()
  await refused()
})

it("a spent limit of the chat's account refuses it, and a reset one does not", async () => {
  await chat('done', false)
  const spent = (resetsAt: number | null) => ({
    account: {
      read: () => ({
        session: { usedPercent: 100, windowMinutes: 300, resetsAt },
        weekly: null,
        status: 'ok'
      })
    }
  })
  for (const resetsAt of [null, Date.now() + 60_000]) {
    accountUsage.mockResolvedValue(spent(resetsAt))
    await refused()
  }
  mocks.blockedEarly = true
  accountUsage.mockResolvedValue(spent(Date.now() - 1))
  expect(await compact()).toBe(true)
})
