import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { AcceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import type { AgentStatusProjection } from '@/store/slices/agent-status/projection/agent-status-projection'
import { countActivityUnread } from './useActivityUnreadCount'

// Local (glass build): workers fold into their coordinator's card and ring only while they wait on you.
const PANE = 'tab-1:11111111-1111-4111-8111-111111111111'

function makeEntry(overrides: Partial<AgentStatusEntry>): AgentStatusEntry {
  return {
    state: 'done',
    prompt: '',
    updatedAt: 2_000,
    stateStartedAt: 2_000,
    paneKey: PANE,
    agentType: 'claude',
    stateHistory: [],
    ...overrides
  }
}

// A pane counts only while it has a workspace row to clear (countActivityUnread skips rowless panes).
const rowedProjection = {
  rowWorktree: (key: string) => (key === PANE ? 'worktree-1' : undefined),
  rowOwnersRevision: () => 0
} as unknown as AgentStatusProjection

function makeSource(entry: AgentStatusEntry, ackAt = 0) {
  return {
    acknowledgedAgentsByPaneKey: { [PANE]: ackAt },
    agentStatusByPaneKey: new AcceptedAgentStatuses(new Map([[PANE, entry]]), rowedProjection, 0),
    migrationUnsupportedByPtyId: {}
  }
}

describe('countActivityUnread for orchestration workers', () => {
  const worker = { taskId: 't', dispatchId: 'd', parentPaneKey: 'tab-0:coordinator' }

  it('counts a finished agent that is not a worker', () => {
    expect(countActivityUnread(makeSource(makeEntry({})))).toBe(1)
  })

  it('does not count a worker that finished', () => {
    expect(countActivityUnread(makeSource(makeEntry({ orchestration: worker })))).toBe(0)
  })

  it('counts a worker waiting on you', () => {
    const source = makeSource(makeEntry({ state: 'waiting', orchestration: worker }))
    expect(countActivityUnread(source)).toBe(1)
  })

  it('reads lineage from the runtime orchestration map too', () => {
    const source = {
      ...makeSource(makeEntry({})),
      runtimeAgentOrchestrationByPaneKey: { [PANE]: worker }
    }
    expect(countActivityUnread(source)).toBe(0)
  })
})
