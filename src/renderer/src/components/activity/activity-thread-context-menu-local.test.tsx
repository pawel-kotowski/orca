// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ActivityThreadContextMenu } from './activity-thread-context-menu'
import type { AgentPaneThread } from './activity-thread-types'
import { makeRepo, makeTab, makeWorktree } from './ActivityPrototypePage-test-fixtures'

// Local-only: delete a card's workspace from its right-click menu (6e6f05b1b6).

const mocks = vi.hoisted(() => ({ deferDelete: vi.fn() }))

vi.mock(
  '../sidebar/workspace-actions/context-menu/worktree-context-menu-delete-intent',
  async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    deferWorktreeContextMenuDeleteIntent: mocks.deferDelete
  })
)

function makeThread(overrides: Partial<AgentPaneThread> = {}): AgentPaneThread {
  return {
    paneKey: 'tab-1:leaf-1',
    paneTitle: 'Fix the flaky test',
    worktree: { ...makeWorktree(), branch: 'refs/heads/feat/flaky' },
    repo: makeRepo(),
    tab: makeTab(),
    agentType: 'claude',
    currentAgentState: 'working',
    currentAgentEntry: null,
    responsePreview: '',
    latestTimestamp: 1000,
    latestEvent: null,
    events: [],
    unread: true,
    ...overrides
  }
}

function openMenu(thread: AgentPaneThread, canJump = true): void {
  render(
    <ActivityThreadContextMenu
      thread={thread}
      canJump={canJump}
      canMarkUnread={() => true}
      onOpen={vi.fn()}
      onJump={vi.fn()}
      onMarkRead={vi.fn()}
      onMarkUnread={vi.fn()}
      onMarkManyRead={vi.fn()}
      onMarkManyUnread={vi.fn()}
    >
      {() => <div data-testid="row">row</div>}
    </ActivityThreadContextMenu>
  )
  fireEvent.contextMenu(screen.getByTestId('row'))
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ActivityThreadContextMenu delete workspace', () => {
  it("deletes the workspace through the workspace view's own delete", () => {
    const thread = makeThread()
    openMenu(thread)

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Workspace…' }))
    expect(mocks.deferDelete).toHaveBeenCalledWith({
      kind: 'worktree',
      worktree: expect.objectContaining({ id: thread.worktree.id })
    })
  })

  it('offers no delete for a main checkout or a workspace with nothing on disk', () => {
    openMenu(makeThread({ worktree: { ...makeWorktree(), isMainWorktree: true } }))
    expect(screen.queryByRole('menuitem', { name: 'Delete Workspace…' })).toBeNull()
    cleanup()
    openMenu(makeThread(), false)
    expect(screen.queryByRole('menuitem', { name: 'Delete Workspace…' })).toBeNull()
  })
})
