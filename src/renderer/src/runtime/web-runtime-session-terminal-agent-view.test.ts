import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebRuntimeSessionTerminal } from './web-runtime-terminal-creation'
import { resetWebSessionCloseIntentForTests } from './web-session-close-intent'
import {
  ENVIRONMENT_ID,
  WORKTREE_ID,
  resetTerminalCreateEnvironment,
  stubTerminalCreateEnvironment
} from './web-runtime-session-test-harness'

import { stubRuntimeEnvironmentBridge } from './runtime-environment-bridge-fixture'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  setState: vi.fn(),
  subscribe: vi.fn(),
  setActiveWorktree: vi.fn(),
  createBrowserTab: vi.fn(),
  closeEmptyGroup: vi.fn(),
  moveUnifiedTabToGroup: vi.fn(),
  setRemoteBrowserPageHandle: vi.fn(),
  focusBrowserTabInWorktree: vi.fn(),
  applyWebSessionTabsSnapshot: vi.fn(),
  decideWebSessionTabsSnapshot: vi.fn(() => ({ apply: true, settlesHostMirror: true })),
  acceptReplayedWebSessionTabsSnapshot: vi.fn(),
  resolveHostSessionTabIdForWebSessionTab: vi.fn(),
  trackTerminalPaneSplit: vi.fn(),
  deliverLaunchPromptToAgentTab: vi.fn(),
  seedNativeChatLaunchDraftForAgentTab: vi.fn(),
  hasMaterializedWebRuntimeBrowserPage: vi.fn(),
  defaultAgentTabViewMode: vi.fn()
}))

vi.mock('../store', () => ({
  useAppStore: {
    getState: mocks.getState,
    setState: mocks.setState,
    subscribe: mocks.subscribe
  }
}))

vi.mock('./web-session-tabs-sync/tracking-lifecycle', () => ({
  acceptReplayedWebSessionTabsSnapshot: mocks.acceptReplayedWebSessionTabsSnapshot
}))
vi.mock('./web-session-tabs-sync/snapshot-api', () => ({
  applyWebSessionTabsSnapshot: mocks.applyWebSessionTabsSnapshot
}))
vi.mock('./web-session-tabs-sync/tracking-decisions', () => ({
  decideWebSessionTabsSnapshot: mocks.decideWebSessionTabsSnapshot
}))
vi.mock('./web-session-tabs-sync/store-patch', () => ({
  applyWebSessionTabsStorePatch: (buildPatch: (state: unknown) => unknown) => {
    mocks.setState(buildPatch)
    return () => {}
  }
}))
vi.mock('./web-session-tabs-sync/tracking-mappings', () => ({
  resolveHostSessionTabIdForWebSessionTab: mocks.resolveHostSessionTabIdForWebSessionTab
}))

vi.mock('@/lib/feature-education-telemetry', () => ({
  trackTerminalPaneSplit: mocks.trackTerminalPaneSplit
}))

vi.mock('@/lib/agent-launch-prompt-delivery', () => ({
  deliverLaunchPromptToAgentTab: mocks.deliverLaunchPromptToAgentTab,
  seedNativeChatLaunchDraftForAgentTab: mocks.seedNativeChatLaunchDraftForAgentTab
}))

vi.mock('./web-runtime-browser-materialization', () => ({
  hasMaterializedWebRuntimeBrowserPage: mocks.hasMaterializedWebRuntimeBrowserPage
}))

vi.mock('@/lib/agent-tab-default-view-mode', () => ({
  defaultAgentTabViewMode: mocks.defaultAgentTabViewMode
}))

afterEach(() => resetWebSessionCloseIntentForTests())

function createParams(runtimeCall: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const create = runtimeCall.mock.calls.find(([request]) =>
    ['terminal.createAgentSession', 'session.tabs.createTerminal'].includes(
      String((request as { method?: string }).method)
    )
  )
  return ((create?.[0] as { params?: Record<string, unknown> })?.params ?? {}) as Record<
    string,
    unknown
  >
}

describe('a remote agent tab opens in the view new agents open in', () => {
  beforeEach(() => {
    stubTerminalCreateEnvironment(mocks)
  })

  afterEach(() => {
    resetTerminalCreateEnvironment()
    mocks.defaultAgentTabViewMode.mockReset()
  })

  it('asks the host for the Chat UI when the caller chose no view', async () => {
    mocks.defaultAgentTabViewMode.mockReturnValue('chat')
    const runtimeCall = vi.fn().mockRejectedValue(new Error('stop after the create call'))
    stubRuntimeEnvironmentBridge({ call: runtimeCall })

    await createWebRuntimeSessionTerminal({
      worktreeId: WORKTREE_ID,
      environmentId: ENVIRONMENT_ID,
      launchAgent: 'claude',
      activate: true
    })

    expect(mocks.defaultAgentTabViewMode).toHaveBeenCalledWith(
      expect.anything(),
      WORKTREE_ID,
      'claude'
    )
    expect(createParams(runtimeCall).viewMode).toBe('chat')
  })

  it('keeps a view the caller chose', async () => {
    mocks.defaultAgentTabViewMode.mockReturnValue('chat')
    const runtimeCall = vi.fn().mockRejectedValue(new Error('stop after the create call'))
    stubRuntimeEnvironmentBridge({ call: runtimeCall })

    await createWebRuntimeSessionTerminal({
      worktreeId: WORKTREE_ID,
      environmentId: ENVIRONMENT_ID,
      launchAgent: 'claude',
      viewMode: 'terminal',
      activate: true
    })

    expect(createParams(runtimeCall).viewMode).toBe('terminal')
  })
})
