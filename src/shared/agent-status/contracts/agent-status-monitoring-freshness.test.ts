import { describe, expect, it } from 'vitest'
import {
  AGENT_STATUS_MONITORING_STALE_AFTER_MS,
  AGENT_STATUS_STALE_AFTER_MS,
  isAgentStatusFresh
} from './agent-status-freshness'

const now = 10 * AGENT_STATUS_MONITORING_STALE_AFTER_MS
const silentFor = (ms: number) => ({ updatedAt: now - ms, evidenceObservedAt: now - ms })

describe('a monitoring row stays fresh while it waits on its own background work', () => {
  it('keeps a monitoring row live past the usual silence limit', () => {
    const entry = {
      ...silentFor(2 * 60 * 60 * 1000),
      state: 'working' as const,
      workingMode: 'monitoring' as const
    }
    expect(isAgentStatusFresh(entry, now)).toBe(true)
  })

  it('still ends it after the monitoring limit', () => {
    const entry = {
      ...silentFor(AGENT_STATUS_MONITORING_STALE_AFTER_MS + 1),
      state: 'working' as const,
      workingMode: 'monitoring' as const
    }
    expect(isAgentStatusFresh(entry, now)).toBe(false)
  })

  it('leaves a plain working row on the usual limit', () => {
    const entry = { ...silentFor(AGENT_STATUS_STALE_AFTER_MS + 1), state: 'working' as const }
    expect(isAgentStatusFresh(entry, now)).toBe(false)
  })

  it('never makes an unconfirmed restored row fresh', () => {
    const entry = {
      ...silentFor(1000),
      state: 'working' as const,
      workingMode: 'monitoring' as const,
      restoredUnconfirmed: true as const
    }
    expect(isAgentStatusFresh(entry, now)).toBe(false)
  })
})
