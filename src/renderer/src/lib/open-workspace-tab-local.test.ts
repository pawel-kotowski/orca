import { describe, expect, it } from 'vitest'
import { openWorkspaceTabId } from './open-workspace-tab'

describe('openWorkspaceTabId', () => {
  it('names the open chat, not the terminal the store last focused', () => {
    const state = {
      activeTabType: 'agent-session',
      activeTabId: 'terminal-1',
      activeWorktreeId: 'w',
      activeGroupIdByWorktree: { w: 'g' },
      groupsByWorktree: { w: [{ id: 'g', activeTabId: 'chat-1' }] },
      unifiedTabsByWorktree: { w: [{ id: 'chat-1' }] }
    } as never as Parameters<typeof openWorkspaceTabId>[0]
    expect(openWorkspaceTabId(state)).toBe('chat-1')
    expect(openWorkspaceTabId({ ...state, activeTabType: 'terminal' })).toBe('terminal-1')
  })
})
