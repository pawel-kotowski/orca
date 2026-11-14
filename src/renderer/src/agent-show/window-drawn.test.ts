import { describe, expect, it } from 'vitest'
import type { AppState } from '@/store/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { worktreeDrawn } from './window-drawn'

function state(patch: Partial<AppState>): AppState {
  return {
    activeView: 'terminal',
    activeWorktreeId: 'wt-1',
    settings: { floatingTerminalEnabled: true },
    floatingWorkspacePanelOpen: false,
    ...patch
  } as AppState
}

describe('worktreeDrawn', () => {
  it('is the workspace view showing that worktree', () => {
    expect(worktreeDrawn(state({}), 'wt-1')).toBe(true)
    expect(worktreeDrawn(state({ activeWorktreeId: 'wt-2' }), 'wt-1')).toBe(false)
    expect(worktreeDrawn(state({ activeWorktreeId: null }), 'wt-1')).toBe(false)
  })

  it('is not drawn under Activity or another page, whatever worktree is selected', () => {
    expect(worktreeDrawn(state({ activeView: 'activity' }), 'wt-1')).toBe(false)
  })

  it('is covered by the floating panel, which is itself drawn', () => {
    const floating = state({ floatingWorkspacePanelOpen: true })
    expect(worktreeDrawn(floating, 'wt-1')).toBe(false)
    expect(worktreeDrawn(floating, FLOATING_TERMINAL_WORKTREE_ID)).toBe(true)
  })
})
