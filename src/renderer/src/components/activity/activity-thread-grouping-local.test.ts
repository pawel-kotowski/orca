import { describe, expect, it } from 'vitest'
import { READ_AGENTS_GROUP_KEY, withReadAgentsGroup } from './activity-thread-grouping'

// Local-only: Standing by, the last section of the activity list (51868bb6bb, 896e9ee1b0).

describe('withReadAgentsGroup', () => {
  it('adds the agents the unread filter hides as one last section, newest first', () => {
    const older = { paneKey: 'a', latestTimestamp: 1 } as never
    const newer = { paneKey: 'b', latestTimestamp: 2 } as never
    const groups = withReadAgentsGroup(
      [{ key: 'working', label: 'Working', threads: [] }],
      [older, newer]
    )
    expect(groups.map((group) => group.key)).toEqual(['working', READ_AGENTS_GROUP_KEY])
    expect(groups[1]!.threads).toEqual([newer, older])
    expect(withReadAgentsGroup([], [])).toEqual([])
  })

  it('orders Standing by by the latest prompt, not the latest activity', () => {
    const promptedLately = {
      paneKey: 'a',
      latestTimestamp: 10,
      currentAgentEntry: { turnStartedAt: 9 }
    } as never
    const busyLately = {
      paneKey: 'b',
      latestTimestamp: 20,
      currentAgentEntry: { turnStartedAt: 5 }
    } as never
    const [, standingBy] = withReadAgentsGroup(
      [{ key: 'working', label: 'Working', threads: [] }],
      [busyLately, promptedLately]
    )
    expect(standingBy!.threads).toEqual([promptedLately, busyLately])
  })
})
