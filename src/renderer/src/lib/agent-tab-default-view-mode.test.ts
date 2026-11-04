import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import { defaultAgentTabViewMode, resolveAgentTabViewMode } from './agent-tab-default-view-mode'

function state(settings: Partial<AppState['settings']> | null): AppState {
  return { settings, repos: [], worktreesByRepo: {}, folderWorkspaces: [] } as unknown as AppState
}

describe('defaultAgentTabViewMode', () => {
  it('opens a CLI agent in its Chat UI by default', () => {
    expect(defaultAgentTabViewMode(state({}), 'global-floating-terminal', 'claude')).toBe('chat')
  })

  it('keeps the terminal once the user turns the default off', () => {
    const off = state({ nativeChatAppearance: { cliAgentsOpenInChat: false } })
    expect(defaultAgentTabViewMode(off, 'global-floating-terminal', 'claude')).toBeUndefined()
  })

  it('leaves plain terminals alone', () => {
    expect(
      defaultAgentTabViewMode(state({}), 'global-floating-terminal', undefined)
    ).toBeUndefined()
  })
})

describe('resolveAgentTabViewMode', () => {
  it("reads main's 'terminal' surface marker as no view choice", () => {
    expect(
      resolveAgentTabViewMode(state({}), 'global-floating-terminal', 'claude', 'terminal')
    ).toBe('chat')
    const off = state({ nativeChatAppearance: { cliAgentsOpenInChat: false } })
    expect(resolveAgentTabViewMode(off, 'global-floating-terminal', 'claude', 'terminal')).toBe(
      'terminal'
    )
  })
})
