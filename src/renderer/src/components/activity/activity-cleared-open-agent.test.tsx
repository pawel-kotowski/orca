// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import { useAppStore } from '@/store'
import {
  LEAF_ID,
  makeRepo,
  makeTabWithIds,
  makeWorktree
} from './ActivityPrototypePage-test-fixtures'
import { READ_AGENTS_GROUP_KEY } from './activity-thread-grouping'
import { useAgentPaneThreads } from './use-agent-pane-threads'

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  return { useAppStore: createTestStore() }
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Paweł: every open agent in the workspace view is also in the activity view; clearing a card
// hides its past, not the open agent.
describe('a cleared open agent', () => {
  it('stays listed under Other agents, while uncleared agents keep their sections', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000)
    const repo = makeRepo()
    const worktree = makeWorktree()
    const tabs = [
      makeTabWithIds('tab-cleared', worktree.id),
      makeTabWithIds('tab-open', worktree.id)
    ]
    const entries: Record<string, AgentStatusEntry> = {}
    for (const tab of tabs) {
      const paneKey = makePaneKey(tab.id, LEAF_ID)
      entries[paneKey] = {
        paneKey,
        state: 'done',
        prompt: tab.id,
        agentType: 'claude',
        updatedAt: 50_000,
        stateStartedAt: 50_000,
        stateHistory: []
      }
    }
    const clearedKey = makePaneKey('tab-cleared', LEAF_ID)
    useAppStore.setState({
      agentStatusByPaneKey: entries,
      retainedAgentsByPaneKey: {},
      migrationUnsupportedByPtyId: {},
      runtimeAgentOrchestrationByPaneKey: {},
      acknowledgedAgentsByPaneKey: {},
      activityClearedAtByPaneKey: { [clearedKey]: 50_000 },
      repos: [repo],
      worktreesByRepo: { [repo.id]: [worktree] },
      folderWorkspaces: [],
      detectedWorktreesByRepo: {},
      tabsByWorktree: { [worktree.id]: tabs },
      unifiedTabsByWorktree: {},
      agentsVisibleHostIds: null,
      agentsFilterRepoIds: []
    })
    const { result } = renderHook(() =>
      useAgentPaneThreads({
        query: '',
        readFilter: 'all',
        groupBy: 'none',
        selectedPaneKey: null,
        showChildAgents: true
      })
    )
    const groups = result.current.visibleThreadGroups
    const other = groups.find((group) => group.key === READ_AGENTS_GROUP_KEY)
    expect(other?.threads.map((thread) => thread.paneKey)).toEqual([clearedKey])
    const elsewhere = groups
      .filter((group) => group.key !== READ_AGENTS_GROUP_KEY)
      .flatMap((group) => group.threads.map((thread) => thread.paneKey))
    expect(elsewhere).toEqual([makePaneKey('tab-open', LEAF_ID)])
  })
})
