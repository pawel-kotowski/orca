import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { EnrichedAgentHookEventPayload } from '../server/server-types'
import {
  claudeSessionFacts,
  codexSessionFacts,
  piSessionFacts,
  readSessionTailRows,
  type IdleCompactionSessionFacts
} from './idle-compaction-session-facts'
import {
  IDLE_COMPACTION_DELAY_MS,
  IdleCompactionScheduler,
  type IdleCompactionDeps
} from './idle-compaction-scheduler'
import { claudeAllowsIdleCompaction } from './idle-compaction-install'

const T0 = Date.parse('2026-11-13T10:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

function claudeReply(at: number, usage: Record<string, unknown>) {
  return { type: 'assistant', timestamp: iso(at), message: { usage } }
}

describe('claudeSessionFacts', () => {
  it('reads the newest main-thread reply as the context and its cache lifetime', () => {
    const rows = [
      claudeReply(T0, {
        input_tokens: 3,
        cache_read_input_tokens: 470_000,
        cache_creation_input_tokens: 5_000,
        cache_creation: { ephemeral_1h_input_tokens: 5_000, ephemeral_5m_input_tokens: 0 }
      }),
      { ...claudeReply(T0, { input_tokens: 99 }), isSidechain: true }
    ]
    expect(claudeSessionFacts(rows, T0 - 1000)).toEqual({
      contextTokens: 475_003,
      compactedSince: false,
      cacheTtl: '1h'
    })
  })

  it('takes the cache lifetime from an older reply when the newest one only read cache', () => {
    const rows = [
      claudeReply(T0, { input_tokens: 1, cache_read_input_tokens: 300_000 }),
      claudeReply(T0 - 5000, {
        input_tokens: 1,
        cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 800 }
      })
    ]
    expect(claudeSessionFacts(rows, T0 - 1000).cacheTtl).toBe('5m')
  })

  it('a compact boundary after the turn ended counts as compacted, with its smaller context', () => {
    const rows = [
      {
        type: 'system',
        subtype: 'compact_boundary',
        timestamp: iso(T0 + 55 * 60_000),
        compactMetadata: { postTokens: 19_000 }
      },
      claudeReply(T0, { input_tokens: 1, cache_read_input_tokens: 400_000 })
    ]
    expect(claudeSessionFacts(rows, T0)).toMatchObject({
      contextTokens: 19_000,
      compactedSince: true
    })
  })
})

describe('codexSessionFacts and piSessionFacts', () => {
  it('codex: the newest token_count input is the context; a compaction after the turn counts', () => {
    const tokenCount = {
      type: 'event_msg',
      timestamp: iso(T0),
      payload: {
        type: 'token_count',
        info: { last_token_usage: { input_tokens: 250_000, cached_input_tokens: 240_000 } }
      }
    }
    expect(codexSessionFacts([tokenCount], T0 - 1)).toEqual({
      contextTokens: 250_000,
      compactedSince: false
    })
    const compaction = {
      type: 'response_item',
      timestamp: iso(T0 + 60_000),
      payload: { type: 'compaction' }
    }
    expect(codexSessionFacts([compaction, tokenCount], T0)).toEqual({
      contextTokens: 0,
      compactedSince: true
    })
  })

  it('pi / omp: input plus cache of the newest assistant message', () => {
    const message = {
      type: 'message',
      timestamp: iso(T0),
      message: { role: 'assistant', usage: { input: 1000, cacheRead: 210_000, cacheWrite: 500 } }
    }
    expect(piSessionFacts([message], T0 - 1)).toEqual({
      contextTokens: 211_500,
      compactedSince: false
    })
  })

  it('reads whole rows from the file tail, newest first, dropping the cut first line', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'idle-compaction-'))
    const path = join(dir, 'session.jsonl')
    const lines = Array.from({ length: 50 }, (_, i) =>
      JSON.stringify({ n: i, pad: 'x'.repeat(40) })
    )
    await writeFile(path, `${lines.join('\n')}\n`)
    const rows = await readSessionTailRows(path, 200)
    expect(rows[0]).toMatchObject({ n: 49 })
    expect(rows.every((row) => typeof row.n === 'number')).toBe(true)
  })
})

describe('claudeAllowsIdleCompaction', () => {
  it("honours Claude's own idleCompaction switch in the transcript's config folder", async () => {
    const config = await mkdtemp(join(tmpdir(), 'idle-compaction-config-'))
    const transcript = join(config, 'projects', '-x', 's.jsonl')
    expect(await claudeAllowsIdleCompaction(transcript)).toBe(true)
    await writeFile(join(config, 'settings.json'), JSON.stringify({ idleCompaction: false }))
    expect(await claudeAllowsIdleCompaction(transcript)).toBe(false)
  })
})

type Harness = {
  scheduler: IdleCompactionScheduler
  timers: { run: () => void; ms: number; cancelled: boolean }[]
  sent: string[]
  logs: string[]
  setNow: (ms: number) => void
}

function harness(overrides: Partial<IdleCompactionDeps> = {}, facts?: IdleCompactionSessionFacts) {
  let now = T0
  const h: Harness = {
    scheduler: null as unknown as IdleCompactionScheduler,
    timers: [],
    sent: [],
    logs: [],
    setNow: (ms) => {
      now = ms
    }
  }
  h.scheduler = new IdleCompactionScheduler({
    now: () => now,
    setTimer: (run, ms) => {
      const timer = { run, ms, cancelled: false }
      h.timers.push(timer)
      return { cancel: () => (timer.cancelled = true) }
    },
    minTokens: 200_000,
    allowedBySettings: async () => true,
    readFacts: async () =>
      facts ?? { contextTokens: 400_000, compactedSince: false, cacheTtl: '1h' },
    terminalHandle: () => 'term_1',
    inputHold: () => null,
    sendCompact: async (handle) => {
      h.sent.push(handle)
    },
    log: (line) => h.logs.push(line),
    ...overrides
  })
  return h
}

function status(
  state: 'done' | 'working' | 'waiting',
  extra: Partial<EnrichedAgentHookEventPayload> = {}
): EnrichedAgentHookEventPayload {
  return {
    paneKey: 'tab:leaf',
    connectionId: null,
    source: 'claude',
    receivedAt: T0,
    stateStartedAt: T0,
    turnEndedAt: T0,
    providerSession: { key: 'session_id', id: 's', transcriptPath: '/c/projects/p/s.jsonl' },
    payload: { state, prompt: 'p', agentType: 'claude' },
    ...extra
  } as EnrichedAgentHookEventPayload
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve()
  }
}

describe('IdleCompactionScheduler', () => {
  it('types /compact 57 minutes after a large conversation went idle', async () => {
    const h = harness()
    h.scheduler.onStatus(status('done'))
    expect(h.timers).toHaveLength(1)
    expect(h.timers[0]!.ms).toBe(IDLE_COMPACTION_DELAY_MS)
    h.setNow(T0 + IDLE_COMPACTION_DELAY_MS)
    h.timers[0]!.run()
    await flush()
    expect(h.sent).toEqual(['term_1'])
    expect(h.logs[0]).toContain('compacted agent=claude')
  })

  it('a new turn cancels the wait; a re-sent done for the same turn does not re-arm it', async () => {
    const h = harness()
    h.scheduler.onStatus(status('done'))
    h.scheduler.onStatus(status('done'))
    expect(h.timers).toHaveLength(1)
    h.scheduler.onStatus(status('working', { stateStartedAt: T0 + 1000 }))
    expect(h.timers[0]!.cancelled).toBe(true)
  })

  it('leaves small, compacted, held, relayed and unknown-agent panes alone', async () => {
    const small = harness({}, { contextTokens: 120_000, compactedSince: false })
    small.scheduler.onStatus(status('done'))
    small.setNow(T0 + IDLE_COMPACTION_DELAY_MS)
    small.timers[0]!.run()
    await flush()
    expect(small.sent).toEqual([])
    expect(small.logs[0]).toContain('small')

    const own = harness({}, { contextTokens: 19_000, compactedSince: true })
    own.scheduler.onStatus(status('done'))
    own.setNow(T0 + IDLE_COMPACTION_DELAY_MS)
    own.timers[0]!.run()
    await flush()
    expect(own.logs[0]).toContain('already_compacted')

    const held = harness({ inputHold: () => 'draft' })
    held.scheduler.onStatus(status('done'))
    held.setNow(T0 + IDLE_COMPACTION_DELAY_MS)
    held.timers[0]!.run()
    await flush()
    expect(held.sent).toEqual([])
    expect(held.logs[0]).toContain('held')

    const relayed = harness()
    relayed.scheduler.onStatus(status('done', { connectionId: 'ssh-1' }))
    expect(relayed.timers).toEqual([])

    const other = harness()
    other.scheduler.onStatus(
      status('done', {
        source: 'gemini',
        payload: { state: 'done', prompt: '', agentType: 'gemini' } as never
      })
    )
    expect(other.timers).toEqual([])
  })

  it('a timer that fires late (the laptop slept) does nothing', async () => {
    const h = harness()
    h.scheduler.onStatus(status('done'))
    h.setNow(T0 + IDLE_COMPACTION_DELAY_MS + 10 * 60_000)
    h.timers[0]!.run()
    await flush()
    expect(h.sent).toEqual([])
    expect(h.logs[0]).toContain('lapsed')
  })

  it('a turn that starts while the session file is read wins', async () => {
    let release: () => void = () => {}
    const h = harness({
      readFacts: () =>
        new Promise((resolve) => {
          release = () => resolve({ contextTokens: 400_000, compactedSince: false, cacheTtl: '1h' })
        })
    })
    h.scheduler.onStatus(status('done'))
    h.setNow(T0 + IDLE_COMPACTION_DELAY_MS)
    h.timers[0]!.run()
    await flush()
    h.scheduler.onStatus(status('working', { stateStartedAt: T0 + IDLE_COMPACTION_DELAY_MS }))
    release()
    await flush()
    expect(h.sent).toEqual([])
    expect(h.logs[0]).toContain('superseded')
  })

  it('codex and omp panes are armed too', () => {
    const h = harness()
    h.scheduler.onStatus(
      status('done', {
        source: 'codex',
        payload: { state: 'done', prompt: '', agentType: 'codex' } as never
      })
    )
    h.scheduler.onStatus(
      status('done', {
        paneKey: 'tab:omp',
        source: 'omp',
        payload: { state: 'done', prompt: '', agentType: 'omp' } as never
      })
    )
    expect(h.timers).toHaveLength(2)
  })
})
