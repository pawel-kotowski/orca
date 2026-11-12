import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWebRuntimeSessionTerminal } from './hosted-terminals/creation/web-runtime-terminal-creation'
import { resetWebSessionCloseIntentForTests } from './web-session-tabs-sync/closing/web-session-close-intent'
import {
  ENVIRONMENT_ID,
  WORKTREE_ID,
  resetTerminalCreateEnvironment,
  stubTerminalCreateEnvironment
} from './hosted-terminals/creation/testing/web-runtime-terminal-create.test-fixture'

import { stubRuntimeEnvironmentBridge } from './rpc/testing/runtime-environment-bridge-fixture'

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
  resolveAgentTabViewMode: vi.fn()
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

vi.mock('@/diagnostics/telemetry/feature-education-telemetry', () => ({
  trackTerminalPaneSplit: mocks.trackTerminalPaneSplit
}))

vi.mock('@/lib/agent-session/launch/prompt/agent-launch-prompt-delivery', () => ({
  deliverLaunchPromptToAgentTab: mocks.deliverLaunchPromptToAgentTab,
  seedNativeChatLaunchDraftForAgentTab: mocks.seedNativeChatLaunchDraftForAgentTab
}))

vi.mock('./browser/creation/web-runtime-browser-materialization', () => ({
  hasMaterializedWebRuntimeBrowserPage: mocks.hasMaterializedWebRuntimeBrowserPage
}))

vi.mock('@/lib/agent-tab-default-view-mode', () => ({
  resolveAgentTabViewMode: mocks.resolveAgentTabViewMode
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
    mocks.resolveAgentTabViewMode.mockReset()
  })

  it('asks the host for the Chat UI when the caller chose no view', async () => {
    mocks.resolveAgentTabViewMode.mockReturnValue('chat')
    const runtimeCall = vi.fn().mockRejectedValue(new Error('stop after the create call'))
    stubRuntimeEnvironmentBridge({ call: runtimeCall })

    await createWebRuntimeSessionTerminal({
      worktreeId: WORKTREE_ID,
      environmentId: ENVIRONMENT_ID,
      launchAgent: 'claude',
      activate: true
    })

    expect(mocks.resolveAgentTabViewMode).toHaveBeenCalledWith(
      expect.anything(),
      WORKTREE_ID,
      'claude',
      undefined
    )
    expect(createParams(runtimeCall).viewMode).toBe('chat')
  })

  it("resolves a launch's terminal surface marker like a local launch", async () => {
    // Why: launch-agent-in-new-tab marks every host launch 'terminal' (the surface, not a choice).
    mocks.resolveAgentTabViewMode.mockReturnValue('chat')
    const runtimeCall = vi.fn().mockRejectedValue(new Error('stop after the create call'))
    stubRuntimeEnvironmentBridge({ call: runtimeCall })

    await createWebRuntimeSessionTerminal({
      worktreeId: WORKTREE_ID,
      environmentId: ENVIRONMENT_ID,
      launchAgent: 'claude',
      viewMode: 'terminal',
      activate: true
    })

    expect(mocks.resolveAgentTabViewMode).toHaveBeenCalledWith(
      expect.anything(),
      WORKTREE_ID,
      'claude',
      'terminal'
    )
    expect(createParams(runtimeCall).viewMode).toBe('chat')
  })
})
