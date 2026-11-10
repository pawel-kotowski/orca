import { describe, expect, it } from 'vitest'
import { isActivityThreadStandingBy } from './activity-inbox-sections'
import type { AgentPaneThread } from './activity-thread-types'

function clearedThread(currentAgentState: AgentPaneThread['currentAgentState']): AgentPaneThread {
  return {
    paneKey: 'tab-1:pane-1',
    unread: false,
    currentAgentState,
    events: [{ cleared: true, state: 'done' }],
    latestEvent: { state: 'done' }
  } as unknown as AgentPaneThread
}

describe('isActivityThreadStandingBy', () => {
  it('stands a cleared, finished card by', () => {
    expect(isActivityThreadStandingBy(clearedThread(null), {}, null, 0)).toBe(true)
  })

  // A monitoring turn adds no event, so a coordinator cleared earlier keeps only cleared events.
  it.each(['monitoring', 'working'] as const)(
    'keeps a cleared card that is %s out of it',
    (state) => {
      expect(isActivityThreadStandingBy(clearedThread(state), {}, null, 0)).toBe(false)
    }
  )
})
