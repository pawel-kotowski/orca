// local/orca-glass: `orca terminal create --worktree … --command 'claude-as …'` on this machine is
// started by main and revealed here with no launch agent; the command's agent still picks the view
// "Open CLI agents in Chat UI" gives new agents (seen 2026-11-10: it opened as a terminal).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestStore, seedStore } from '../../store/testing/app-store-test-fixture'
import { makeWorktree } from '../../store/slices/worktrees/worktree.test-fixture'
import { createStoreSessionMockApi } from '../../store/testing/app-store-session-api.test-fixture'

const mocks = vi.hoisted(() => {
  const store: { current: ReturnType<typeof createTestStore> | null } = { current: null }
  return { store }
})

function testStore(): ReturnType<typeof createTestStore> {
  if (!mocks.store.current) {
    throw new Error('test store not created')
  }
  return mocks.store.current
}

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }))
vi.mock('../../store', () => ({
  useAppStore: {
    getState: () => testStore().getState(),
    setState: (...args: Parameters<ReturnType<typeof createTestStore>['setState']>) =>
      testStore().setState(...args),
    subscribe: () => () => {}
  }
}))
vi.mock('@/components/terminal-pane/input/focus/focus-terminal-tab-surface', () => ({
  focusTerminalTabSurface: vi.fn()
}))

import { registerTerminalPresentationIpcBridge } from './terminal-presentation-ipc-bridge'

const WORKTREE = 'repo1::/repo1/main'

type Listener = (payload: Record<string, unknown>) => void

function setup(cliAgentsOpenInChat?: boolean) {
  const listeners = new Map<string, Listener>()
  const ui = new Proxy(
    {},
    {
      get: (_target, name) =>
        typeof name === 'string' && name.startsWith('on')
          ? (listener: Listener) => {
              listeners.set(name, listener)
              return () => {}
            }
          : vi.fn()
    }
  )
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), api: { ...createStoreSessionMockApi(), ui } })
  const store = createTestStore()
  mocks.store.current = store
  seedStore(store, {
    worktreesByRepo: {
      repo1: [makeWorktree({ id: WORKTREE, repoId: 'repo1', path: '/repo1/main' })]
    }
  })
  if (cliAgentsOpenInChat !== undefined) {
    store.setState({
      settings: {
        ...store.getState().settings,
        nativeChatAppearance: { cliAgentsOpenInChat }
      } as never
    })
  }
  registerTerminalPresentationIpcBridge([])
  const reveal = (extra: Record<string, unknown>) =>
    listeners.get('onCreateTerminal')?.({
      requestId: 'request-1',
      worktreeId: WORKTREE,
      ptyId: 'pty-1',
      title: 'Claude',
      presentation: 'background',
      surfaceOwner: false,
      ...extra
    })
  // The view is the unified tab's.
  const createdTab = () => {
    const terminal = store.getState().tabsByWorktree[WORKTREE]?.[0]
    return store
      .getState()
      .unifiedTabsByWorktree[WORKTREE]?.find((tab) => tab.entityId === terminal?.id)
  }
  return { reveal, createdTab }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('a terminal main started to run a CLI agent command', () => {
  it('opens in its Chat UI', () => {
    const { reveal, createdTab } = setup()
    reveal({ commandAgent: 'claude' })
    expect(createdTab()?.viewMode).toBe('chat')
  })

  it('opens in the terminal when "Open CLI agents in Chat UI" is off', () => {
    const { reveal, createdTab } = setup(false)
    reveal({ commandAgent: 'claude' })
    expect(createdTab()?.viewMode).toBeUndefined()
  })

  it('leaves a plain shell a terminal', () => {
    const { reveal, createdTab } = setup()
    reveal({})
    expect(createdTab()).toBeDefined()
    expect(createdTab()?.viewMode).toBeUndefined()
  })
})
