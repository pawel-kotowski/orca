// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { makePaneKey } from '../../../../../shared/workspace-layout/stable-pane-id'
import { toSshExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { useAppStore } from '@/store'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import {
  LEAF_ID,
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from '../development/activity-test-fixtures-local'
import { useAgentPaneThreads } from './use-agent-pane-threads'

// Local (glass build): workers fold into their coordinator's card (1c319d480d), even while one is
// the open agent. Ported from upstream's deleted activity-search-query.test.tsx.

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/testing/app-store-test-fixture')
  return { useAppStore: createTestStore() }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function installThreads(count: number): string[] {
  vi.spyOn(Date, 'now').mockReturnValue(100_000)
  const repo = makeRepo()
  const worktree = makeWorktree()
  const tabs = Array.from({ length: count }, (_, index) =>
    makeTabWithIds(`tab-${index}`, worktree.id)
  )
  const entries: [string, AgentStatusEntry][] = tabs.map((tab) => {
    const paneKey = makePaneKey(tab.id, LEAF_ID)
    return [
      paneKey,
      {
        paneKey,
        state: 'working',
        prompt: 'Task PROJECT progress',
        agentType: 'claude',
        updatedAt: 100_000,
        stateStartedAt: 99_000,
        stateHistory: []
      }
    ]
  })
  useAppStore.setState({
    agentStatusByPaneKey: acceptedAgentStatuses(entries),
    migrationUnsupportedByPtyId: {},
    runtimeAgentOrchestrationByPaneKey: {},
    acknowledgedAgentsByPaneKey: {},
    activityClearedAtByPaneKey: {},
    repos: [repo],
    worktreesByRepo: { [repo.id]: [worktree] },
    folderWorkspaces: [],
    detectedWorktreesByRepo: {},
    tabsByWorktree: { [worktree.id]: tabs },
    unifiedTabsByWorktree: {},
    agentsVisibleHostIds: null,
    agentsFilterRepoIds: []
  })
  return entries.map(([paneKey]) => paneKey)
}

describe('activity workers in the real hook (local)', () => {
  it('keeps an open worker folded inside its coordinator card', () => {
    const panes = installThreads(8)
    const parent = panes[0]
    const child = panes[1]
    useAppStore.setState({
      runtimeAgentOrchestrationByPaneKey: {
        [child]: { parentPaneKey: parent, taskId: 'task', dispatchId: 'dispatch' }
      },
      acknowledgedAgentsByPaneKey: { [child]: 100_000 }
    })
    const activity = renderHook((input) => useAgentPaneThreads(input), {
      initialProps: {
        query: 'PROJECT',
        readFilter: 'unread' as const,
        groupBy: 'none' as const,
        showChildAgents: false,
        selectedPaneKey: child
      }
    })
    expect(activity.result.current.visibleThreads.map((thread) => thread.paneKey)).toEqual(
      panes.filter((pane) => pane !== child)
    )
    act(() => useAppStore.setState({ agentsVisibleHostIds: [toSshExecutionHostId('other')] }))
    expect(activity.result.current.visibleThreads).toEqual([])
    expect(activity.result.current.effectiveSelectedPaneKey).toBe(child)
  })
})
