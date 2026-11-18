import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'
import type { AgentStateHistoryEntry } from '../../../../../shared/agent-status/lifecycle/agent-state-history'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import { buildActivityEvents } from './activity-event-builder'
import {
  makeRepo,
  makeTab,
  makeWorktree,
  PANE_KEY
} from '../development/activity-test-fixtures-local'

// Local (glass build): a cleared open agent stays listed under Standing by (397ab27fcf), so its
// events at or before the cutoff collapse into one cleared stand-in instead of vanishing.

function historyEntry(
  startedAt: number,
  state: AgentStateHistoryEntry['state']
): AgentStateHistoryEntry {
  return { state, prompt: `prompt-${startedAt}`, startedAt }
}

function build(args: {
  entries: Record<string, AgentStatusEntry>
  activityClearedAtByPaneKey: Record<string, number>
}) {
  const repo = makeRepo()
  const worktree = makeWorktree()
  const tab = makeTab()
  return buildActivityEvents({
    chatNames: new Map(),
    agentStatusByPaneKey: acceptedAgentStatuses(Object.entries(args.entries)),
    tabsByWorktree: { [worktree.id]: [tab] },
    worktreeMap: new Map([[worktree.id, worktree]]),
    repoMap: new Map([[repo.id, repo]]),
    acknowledgedAgentsByPaneKey: {},
    activityClearedAtByPaneKey: args.activityClearedAtByPaneKey,
    now: 100_000
  })
}

describe('buildActivityEvents cleared cutoff (local)', () => {
  const doneEntry: AgentStatusEntry = {
    state: 'done',
    prompt: 'finish it',
    updatedAt: 2_000,
    stateStartedAt: 2_000,
    paneKey: PANE_KEY,
    stateHistory: [historyEntry(1_000, 'done')],
    agentType: 'claude'
  }

  it('replaces an open agent events at or before the cutoff with one cleared stand-in', () => {
    const { events } = build({
      entries: { [PANE_KEY]: doneEntry },
      activityClearedAtByPaneKey: { [PANE_KEY]: 2_000 }
    })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ state: 'done', cleared: true, unread: false })
  })

  it('keeps events newer than the cutoff', () => {
    const { events } = build({
      entries: { [PANE_KEY]: doneEntry },
      activityClearedAtByPaneKey: { [PANE_KEY]: 1_000 }
    })
    expect(events.map((event) => event.timestamp)).toEqual([2_000])
  })
})
