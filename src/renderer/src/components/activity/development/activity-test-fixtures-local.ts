// Local (glass build): the activity test fixtures upstream deleted with its activity suites
// (65c84d4110, #43435); the local activity tests still build their repos, workspaces and tabs here.
import type { Repo } from '../../../../../shared/repository/repo-types'
import { makePaneKey } from '../../../../../shared/workspace-layout/stable-pane-id'
import type { TerminalTab } from '../../../../../shared/workspace-layout/terminal-tab-types'
import type { Worktree } from '../../../../../shared/worktree/types'

export const LEAF_ID = '11111111-1111-4111-8111-111111111111'
export const PANE_KEY = makePaneKey('tab-1', LEAF_ID)

export function makeRepo(): Repo {
  return {
    id: 'repo-1',
    path: '/repo',
    displayName: 'Repo',
    badgeColor: '#000',
    addedAt: 1
  }
}

export function makeWorktree(): Worktree {
  return {
    id: 'wt-1',
    repoId: 'repo-1',
    path: '/repo/wt-1',
    head: 'abc123',
    branch: 'feature',
    isBare: false,
    isMainWorktree: false,
    displayName: 'feature',
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1
  }
}

export function makeTab(): TerminalTab {
  return {
    id: 'tab-1',
    ptyId: 'pty-1',
    worktreeId: 'wt-1',
    title: 'Claude',
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

export function makeWorktreeWithId(id: string, repoId = 'repo-1', displayName = id): Worktree {
  return { ...makeWorktree(), id, repoId, path: `/repo/${id}`, displayName }
}

export function makeTabWithIds(id: string, worktreeId: string, title = id): TerminalTab {
  return { ...makeTab(), id, ptyId: `pty-${id}`, worktreeId, title }
}
