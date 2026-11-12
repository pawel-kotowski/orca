// local/orca-glass: a CLI agent its host started with no view chosen (an orchestration worker on a
// remote box, `orca terminal create --command claude` there) opens in this desktop's Chat UI.
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeMobileSessionTabsResult } from '../../../../shared/runtime-types'
import type { RuntimeMobileSessionTerminalClientTab } from '../../../../shared/runtime-mobile-session-tab-contracts'
import type { TerminalTab } from '../../../../shared/workspace-layout/terminal-tab-types'
import { buildMirroredTerminalTabs } from './terminal-build'
import {
  resetExpectedAgentTabViewsForTests,
  setPendingAgentTabViewDefault
} from './expected-agent-tab-view'

const mocks = vi.hoisted(() => ({ setWebRuntimeTabProps: vi.fn() }))
vi.mock('../hosted-terminals/actions/web-runtime-tab-properties', () => ({
  setWebRuntimeTabProps: mocks.setWebRuntimeTabProps
}))

const ENV = 'runtime:box'
const WORKTREE = 'repo::/home/me/orca/workspaces/mos/run-policy-lot-2'
const LOCAL_TAB_ID = 'web-terminal-host-tab'

function workerSurface(
  extra: Partial<RuntimeMobileSessionTerminalClientTab> = {}
): RuntimeMobileSessionTerminalClientTab {
  return {
    type: 'terminal',
    id: 'host-tab::leaf',
    parentTabId: 'host-tab',
    leafId: 'leaf',
    title: 'worker-task-1',
    launchAgent: 'claude',
    isActive: true,
    status: 'ready',
    terminal: 'term_1',
    ...extra
  } as RuntimeMobileSessionTerminalClientTab
}

function snapshot(surface: RuntimeMobileSessionTerminalClientTab): RuntimeMobileSessionTabsResult {
  return {
    worktree: WORKTREE,
    publicationEpoch: 'e1',
    snapshotVersion: 1,
    activeGroupId: null,
    activeTabId: surface.id,
    activeTabType: 'terminal',
    tabs: [surface]
  }
}

function build(
  surface: RuntimeMobileSessionTerminalClientTab,
  existing: TerminalTab[] = []
): TerminalTab {
  const [entry] = buildMirroredTerminalTabs(
    snapshot(surface),
    ENV,
    new Map(existing.map((tab) => [tab.id, tab])),
    {},
    {},
    0,
    1_000
  )
  return entry!.tab
}

async function flushTell(): Promise<void> {
  await vi.dynamicImportSettled()
}

afterEach(() => {
  resetExpectedAgentTabViewsForTests()
  mocks.setWebRuntimeTabProps.mockReset()
})

describe('a host-started CLI agent with no view yet', () => {
  it('opens in Chat UI on first mirror and sets that view on the host once', async () => {
    const decide = vi.fn(() => 'chat' as const)
    setPendingAgentTabViewDefault(decide)
    const surface = workerSurface({ pendingViewAgent: 'claude' })

    expect(build(surface).viewMode).toBe('chat')
    // A discarded build is rebuilt; it stays chat and the host is told only once.
    expect(build(surface).viewMode).toBe('chat')
    await flushTell()

    expect(decide).toHaveBeenCalledWith(WORKTREE, 'claude')
    expect(mocks.setWebRuntimeTabProps).toHaveBeenCalledTimes(1)
    expect(mocks.setWebRuntimeTabProps).toHaveBeenCalledWith({
      worktreeId: WORKTREE,
      tabId: LOCAL_TAB_ID,
      viewMode: 'chat'
    })
  })

  it('opens in the terminal when "Open CLI agents in Chat UI" is off, and fixes that on the host', async () => {
    setPendingAgentTabViewDefault(() => 'terminal')
    expect(build(workerSurface({ pendingViewAgent: 'claude' })).viewMode).toBe('terminal')
    await flushTell()
    expect(mocks.setWebRuntimeTabProps).toHaveBeenCalledWith(
      expect.objectContaining({ viewMode: 'terminal' })
    )
  })

  it('waits while this desktop cannot decide yet', async () => {
    setPendingAgentTabViewDefault(() => null)
    expect(build(workerSurface({ pendingViewAgent: 'claude' })).viewMode).toBeUndefined()
    await flushTell()
    expect(mocks.setWebRuntimeTabProps).not.toHaveBeenCalled()
  })

  it('never changes a view the tab already has', async () => {
    setPendingAgentTabViewDefault(() => 'chat')
    const existing = {
      ...build(workerSurface()),
      viewMode: 'terminal'
    } satisfies TerminalTab
    resetExpectedAgentTabViewsForTests()
    setPendingAgentTabViewDefault(() => 'chat')

    expect(build(workerSurface({ pendingViewAgent: 'claude' }), [existing]).viewMode).toBe(
      'terminal'
    )
    // The host's own choice wins over a stale pending question.
    expect(
      build(workerSurface({ pendingViewAgent: 'claude', viewMode: 'terminal' })).viewMode
    ).toBe('terminal')
    await flushTell()
    expect(mocks.setWebRuntimeTabProps).not.toHaveBeenCalled()
  })

  it('leaves tabs the host did not ask about (plain shells, older agent tabs) as they were', async () => {
    setPendingAgentTabViewDefault(() => 'chat')
    expect(build(workerSurface({ launchAgent: undefined })).viewMode).toBeUndefined()
    expect(build(workerSurface()).viewMode).toBeUndefined()
    await flushTell()
    expect(mocks.setWebRuntimeTabProps).not.toHaveBeenCalled()
  })
})
