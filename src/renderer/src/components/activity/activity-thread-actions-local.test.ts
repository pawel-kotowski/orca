import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '@/components/floating-terminal/floating-terminal'
import { makeRepo, makeTab, makeWorktree } from './ActivityPrototypePage-test-fixtures'
import type { AgentPaneThread } from './activity-thread-types'

// Local-only: the floating panel toggles from its activity cards (70de5db983, fce1e1fa20).

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  activateTabAndFocusPane: vi.fn(),
  activateStructuredAgentSessionTab: vi.fn(),
  activateAndRevealWorkspace: vi.fn(),
  dispatchEvent: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: mocks.getState } }))
vi.mock('@/lib/workspace/tabs/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: mocks.activateTabAndFocusPane
}))
vi.mock('@/lib/agent-session/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: mocks.activateStructuredAgentSessionTab
}))
vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealWorkspace: mocks.activateAndRevealWorkspace
}))
vi.mock('@/components/floating-terminal/floating-workspace-availability', () => ({
  floatingWorkspaceUnavailableReason: () => null
}))

import { createActivityThreadActions } from './activity-thread-actions'
import {
  activityHidesWorkbench,
  setActivityHidesWorkbench
} from '@/lib/activity-workbench-visibility'

function makeThread(): AgentPaneThread {
  return {
    paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
    paneTitle: 'Agent',
    agentType: 'claude',
    worktree: makeWorktree(),
    repo: makeRepo(),
    tab: makeTab(),
    events: [],
    latestEvent: null,
    latestTimestamp: 1_000,
    currentAgentState: 'working',
    currentAgentEntry: null,
    unread: true,
    responsePreview: ''
  }
}

describe('activity cards toggle the floating panel', () => {
  const thread = makeThread()
  let state: Record<string, unknown>

  function makeActions(): ReturnType<typeof createActivityThreadActions> {
    return createActivityThreadActions({
      getMarkAllReadThreads: () => [thread],
      acknowledgeAgents: vi.fn(),
      unacknowledgeAgents: vi.fn(),
      setSelectedPaneKey: vi.fn()
    })
  }

  function makeFloatingThread(): AgentPaneThread {
    return {
      ...thread,
      worktree: { ...thread.worktree, id: FLOATING_TERMINAL_WORKTREE_ID },
      repo: null,
      tab: { ...thread.tab, worktreeId: FLOATING_TERMINAL_WORKTREE_ID }
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('window', { dispatchEvent: mocks.dispatchEvent })
    mocks.activateStructuredAgentSessionTab.mockReturnValue(false)
    mocks.activateAndRevealWorkspace.mockReturnValue({ primaryTabId: null })
    state = {
      getKnownWorktreeById: vi.fn().mockReturnValue(thread.worktree),
      worktreesByRepo: { [thread.worktree.repoId]: [thread.worktree] },
      detectedWorktreesByRepo: {},
      folderWorkspaces: [],
      tabsByWorktree: { [thread.worktree.id]: [thread.tab] },
      unifiedTabsByWorktree: {},
      activeRepoId: thread.worktree.repoId,
      activeWorktreeId: thread.worktree.id,
      setActiveWorktree: vi.fn(),
      setActiveTabType: vi.fn()
    }
    mocks.getState.mockImplementation(() => state)
  })

  afterEach(() => {
    setActivityHidesWorkbench(false)
    vi.unstubAllGlobals()
  })

  it('closes the floating panel on a second click on the card it shows', () => {
    const floatingThread = makeFloatingThread()
    state.settings = { floatingTerminalEnabled: true }
    state.tabsByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [floatingThread.tab] }
    state.floatingWorkspacePanelOpen = true
    state.activeGroupIdByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: 'g1' }
    state.groupsByWorktree = {
      [FLOATING_TERMINAL_WORKTREE_ID]: [{ id: 'g1', activeTabId: 'u1' }]
    }
    state.unifiedTabsByWorktree = {
      [FLOATING_TERMINAL_WORKTREE_ID]: [{ id: 'u1', entityId: floatingThread.tab.id }]
    }

    makeActions().selectThread(floatingThread)

    expect(mocks.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: TOGGLE_FLOATING_TERMINAL_EVENT })
    )
    expect(mocks.activateTabAndFocusPane).not.toHaveBeenCalled()
  })

  it('hides the workspace tabs behind the floating panel when its card opens', () => {
    const floatingThread = makeFloatingThread()
    state.sidebarBody = 'agents'
    state.settings = { floatingTerminalEnabled: true }
    state.tabsByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [floatingThread.tab] }
    mocks.activateAndRevealWorkspace.mockReturnValue(false)
    setActivityHidesWorkbench(false)

    makeActions().selectThread(floatingThread)

    expect(activityHidesWorkbench()).toBe(true)
  })

  it('closes the floating panel when a card that does not float opens', () => {
    state.settings = { floatingTerminalEnabled: true }
    state.floatingWorkspacePanelOpen = true
    mocks.activateAndRevealWorkspace.mockReturnValue(false)

    makeActions().selectThread(thread)

    expect(mocks.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: TOGGLE_FLOATING_TERMINAL_EVENT })
    )
  })
})
