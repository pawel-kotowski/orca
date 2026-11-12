import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: vi.fn() }))

import { carryAgentReachOut } from '../../../../shared/agent-status/contracts/agent-reach-out'
import { buildActivityInboxFacts } from './activity-inbox-facts'
import { activityThreadSection, isActivityThreadStandingBy } from './activity-inbox-sections'
import type { ActivityWorkers } from './activity-workers'
import type { AgentPaneThread } from './activity-thread-types'

const NO_WORKERS: ActivityWorkers = {
  parentByWorker: new Map(),
  workersByParent: new Map(),
  lineageWorkers: new Set()
}

function thread(
  paneKey: string,
  currentAgentState: AgentPaneThread['currentAgentState'],
  reachOut?: { message: string; at: number }
): AgentPaneThread {
  const entry = { state: currentAgentState ? 'working' : 'done', paneKey, reachOut }
  return {
    paneKey,
    unread: false,
    currentAgentState,
    currentAgentEntry: currentAgentState ? entry : null,
    paneEntry: currentAgentState ? undefined : entry,
    events: [{ state: 'done', entry }],
    latestEvent: { state: 'done', entry }
  } as unknown as AgentPaneThread
}

describe('activity inbox facts (Paweł, 2026-11-12: busy agents stay out of the Inbox unless they reach out)', () => {
  it('keeps a monitoring agent under Working until it reaches out, then lists it in the Inbox', () => {
    const quiet = thread('a:1', 'monitoring')
    expect(activityThreadSection(quiet, buildActivityInboxFacts([quiet], NO_WORKERS, {}, {}))).toBe(
      'working'
    )
    const loud = thread('a:1', 'monitoring', { message: 'lots merged', at: 100 })
    const facts = buildActivityInboxFacts([loud], NO_WORKERS, {}, {})
    expect(activityThreadSection(loud, facts)).toBe('inbox')
    expect(facts.unseenReachOuts.has('a:1')).toBe(true)
  })

  it('sends a reach-out back to Working once cleared after it, and stops ringing once seen', () => {
    const loud = thread('a:1', 'monitoring', { message: 'lots merged', at: 100 })
    const seen = buildActivityInboxFacts([loud], NO_WORKERS, {}, { 'a:1': 150 })
    expect(seen.unseenReachOuts.has('a:1')).toBe(false)
    expect(activityThreadSection(loud, seen)).toBe('inbox')
    const cleared = buildActivityInboxFacts([loud], NO_WORKERS, { 'a:1': 200 }, {})
    expect(activityThreadSection(loud, cleared)).toBe('working')
  })

  it('keeps a coordinator whose turn ended under Working while a worker runs', () => {
    const coordinator = thread('c:1', null)
    const worker = thread('w:1', 'working')
    const workers: ActivityWorkers = {
      parentByWorker: new Map([['w:1', coordinator]]),
      workersByParent: new Map([['c:1', [worker]]]),
      lineageWorkers: new Set()
    }
    const facts = buildActivityInboxFacts([coordinator, worker], workers, {}, {})
    expect(activityThreadSection(coordinator, facts)).toBe('working')
    expect(isActivityThreadStandingBy(coordinator, {}, null, 0, facts)).toBe(false)
    // Its workers done, its finish is news again.
    const idle: ActivityWorkers = {
      ...workers,
      workersByParent: new Map([['c:1', [thread('w:1', null)]]])
    }
    expect(
      activityThreadSection(coordinator, buildActivityInboxFacts([coordinator], idle, {}, {}))
    ).toBe('inbox')
  })
})

describe('carryAgentReachOut', () => {
  it('keeps the last reach-out across rows that say nothing about one', () => {
    const first = { reachOut: { message: 'hi', at: 1 }, updatedAt: 1 }
    expect(carryAgentReachOut({ updatedAt: 2, toolName: 'Bash' }, first)).toEqual({
      message: 'hi',
      at: 1
    })
  })

  it('reads an older host’s PushNotification row once, by its tool name', () => {
    const row = { toolName: 'PushNotification', toolInput: 'build ready', updatedAt: 5 }
    expect(carryAgentReachOut(row, { toolName: 'Bash', updatedAt: 4 })).toEqual({
      message: 'build ready',
      at: 5
    })
    const later = { ...row, updatedAt: 9 }
    expect(
      carryAgentReachOut(later, { ...row, reachOut: { message: 'build ready', at: 5 } })
    ).toEqual({ message: 'build ready', at: 5 })
  })
})
