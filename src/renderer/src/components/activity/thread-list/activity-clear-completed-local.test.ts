import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPaneThread } from '../threads/activity-thread-types'

// Local (glass build): a card's X always records the clear (43fdb65c74), a reach-out can be
// dismissed back to Working (4b60079ec5), and a Standing by card comes back to the Inbox (2b54500298).

const mockStore = vi.hoisted(() => ({
  activityClearedAtByPaneKey: {} as Record<string, number>,
  applyActivityClearedAt: vi.fn(),
  unacknowledgeAgents: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mockStore } }))
vi.mock('sonner', () => ({ toast: vi.fn() }))

import {
  dismissActivityReachOut,
  planClearCompletedActivity,
  restoreActivityThreadToInbox
} from './activity-clear-completed'

function makeThread(paneKey: string): AgentPaneThread {
  // A thread with no live state and no events reads as done, which is clearable.
  return {
    paneKey,
    currentAgentState: null,
    currentAgentEntry: null,
    latestEvent: null,
    latestTimestamp: 5_000,
    events: []
  } as unknown as AgentPaneThread
}

describe('local clear stamps', () => {
  beforeEach(() => {
    mockStore.activityClearedAtByPaneKey = {}
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('stamps the clear time, so clearing an already cleared card still records a change', () => {
    mockStore.activityClearedAtByPaneKey = { 't-done:1': 5000 }
    const plan = planClearCompletedActivity([makeThread('t-done:1')], mockStore, 90_000)
    expect(plan.cutoffPatch['t-done:1']).toBe(90_000)
    expect(plan.restorePatch['t-done:1']).toBe(5000)
  })

  it('dismisses a reach-out with a clear newer than both the old one and now', () => {
    vi.spyOn(Date, 'now').mockReturnValue(70_000)
    mockStore.activityClearedAtByPaneKey = { 't-busy:1': 10_000 }
    dismissActivityReachOut(makeThread('t-busy:1'))
    expect(mockStore.applyActivityClearedAt).toHaveBeenCalledWith({ 't-busy:1': 70_000 })
  })

  it('brings a Standing by card back to the Inbox: lifts its clear and marks it unread', () => {
    restoreActivityThreadToInbox(makeThread('t-done:1'))
    expect(mockStore.applyActivityClearedAt).toHaveBeenCalledWith({ 't-done:1': null })
    expect(mockStore.unacknowledgeAgents).toHaveBeenCalledWith(['t-done:1'])
  })
})
