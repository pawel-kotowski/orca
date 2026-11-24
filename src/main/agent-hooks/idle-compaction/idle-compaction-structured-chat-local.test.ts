import { describe, expect, it } from 'vitest'
import { structuredAgentSessionTabId } from '../../../shared/agent-session/view/structured-agent-session-projection'
import type { EnrichedAgentHookEventPayload } from '../server/server-types'
import { IDLE_COMPACTION_DELAY_MS, IdleCompactionScheduler } from './idle-compaction-scheduler'
import {
  chatCompactionFacts,
  contextTokensOfUsage,
  type IdleCompactionChatTarget
} from './idle-compaction-structured-chat'

const T0 = Date.parse('2026-11-24T10:00:00Z')

function chatDone(extra: Partial<EnrichedAgentHookEventPayload> = {}) {
  return {
    paneKey: 'p:l',
    tabId: structuredAgentSessionTabId('chat-1'),
    connectionId: null,
    structuredHost: 'owned',
    receivedAt: T0,
    stateStartedAt: T0,
    providerSession: { key: 'session_id', id: 'native-1' },
    payload: { state: 'done', prompt: 'p', agentType: 'claude' },
    ...extra
  } as EnrichedAgentHookEventPayload
}

async function run(
  chats: Partial<IdleCompactionChatTarget> = {},
  events: EnrichedAgentHookEventPayload[] = [chatDone()],
  onReady: (scheduler: IdleCompactionScheduler) => void = () => {}
) {
  let now = T0
  const timers: (() => void)[] = []
  const compacted: unknown[] = []
  const logs: string[] = []
  const scheduler = new IdleCompactionScheduler({
    now: () => now,
    setTimer: (fire) => {
      timers.push(fire)
      return { cancel: () => {} }
    },
    minTokens: 200_000,
    allowedBySettings: async () => true,
    readFacts: () => Promise.reject(new Error('a chat has no hook transcript')),
    terminalHandle: () => null,
    inputHold: () => null,
    sendCompact: () => Promise.reject(new Error('a chat has no terminal')),
    chats: {
      source: async () => ({ transcriptPath: '/h/projects/p/s.jsonl', configDir: '/h' }),
      readFacts: async () => ({ contextTokens: 400_000, compactedSince: false }),
      hold: () => null,
      compact: async (chat) => compacted.push(chat) > 0,
      ...chats
    },
    log: (line) => logs.push(line)
  })
  onReady(scheduler)
  events.forEach((event) => scheduler.onStatus(event))
  now = T0 + IDLE_COMPACTION_DELAY_MS
  timers.forEach((fire) => fire())
  await new Promise((resolve) => setImmediate(resolve))
  return { timers, compacted, outcome: logs[0]?.split(' ')[1] }
}

describe('idle compaction of a chat', () => {
  it('asks the host to compact, and once for a row restated when its child stops', async () => {
    const { compacted, outcome, timers } = await run({}, [
      chatDone(),
      chatDone({ structuredHost: 'held' })
    ])
    expect(compacted).toEqual([{ sessionId: 'chat-1', providerSessionId: 'native-1' }])
    expect(outcome).toBe('compacted')
    expect(timers).toHaveLength(1)
  })

  it('a refusal, a cleared or closed chat and a failed start are told apart', async () => {
    expect((await run({ compact: async () => false })).outcome).toBe('held')
    expect((await run({ hold: () => 'superseded' })).outcome).toBe('superseded')
    expect((await run({ hold: () => 'no_terminal' })).compacted).toEqual([])
    expect((await run({ compact: () => Promise.reject(new Error('x')) })).outcome).toBe(
      'send_failed'
    )
  })

  it('its own read of the chat, which restates the row, does not count as the agent moving on', async () => {
    let restate: () => void = () => {}
    const { outcome } = await run(
      {
        readFacts: async () => {
          restate()
          return { contextTokens: 400_000, compactedSince: false }
        }
      },
      [chatDone()],
      (scheduler) => {
        restate = () => scheduler.onStatus(chatDone({ structuredHost: 'held' }))
      }
    )
    expect(outcome).toBe('compacted')
  })

  it('a Claude chat whose transcript is not found is left alone; Codex keeps no cache there', async () => {
    const source = async () => ({ transcriptPath: null, configDir: null })
    expect((await run({ source })).outcome).toBe('unreadable')
    const codex = chatDone({ payload: { state: 'done', prompt: 'p', agentType: 'codex' } })
    expect((await run({ source }, [codex])).outcome).toBe('compacted')
  })

  it('a chat without a provider conversation is never armed', async () => {
    expect((await run({}, [chatDone({ providerSession: undefined })])).timers).toEqual([])
  })

  it('measures the journal context; a cleared or compacted one measures nothing', () => {
    const usage = {
      inputTokens: 2,
      cacheCreationInputTokens: 1_000,
      cacheReadInputTokens: 300_000,
      outputTokens: 9
    }
    expect(contextTokensOfUsage({ used: { kind: 'estimate', usage, capturedAt: 1 } })).toBe(301_002)
    expect(contextTokensOfUsage({ used: { kind: 'unknown', capturedAt: 2 } })).toBeNull()
    expect(contextTokensOfUsage({})).toBeNull()
    // A /clear leaves the old transcript large; the journal's answer wins.
    expect(
      chatCompactionFacts(null, { contextTokens: 400_000, compactedSince: false, cacheTtl: '1h' })
    ).toEqual({ contextTokens: null, compactedSince: false, cacheTtl: '1h' })
  })
})
