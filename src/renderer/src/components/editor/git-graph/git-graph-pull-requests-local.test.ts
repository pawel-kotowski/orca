import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({ repos: [] }) } }))

import {
  gitGraphPullRequestForBranch,
  gitGraphPullRequestForMerge,
  type GitGraphPullRequest,
  type GitGraphPullRequests
} from './use-git-graph-pull-requests'

const pr = (
  number: number,
  state: GitGraphPullRequest['state'],
  branchName: string,
  headSha?: string
): GitGraphPullRequest => ({
  number,
  title: `PR ${number}`,
  state,
  url: `https://github.com/o/r/pull/${number}`,
  branchName,
  headSha
})

function lookup(prs: GitGraphPullRequest[], on = true): GitGraphPullRequests {
  const byBranch = new Map<string, GitGraphPullRequest[]>()
  for (const entry of [...prs].sort((a, b) => b.number - a.number)) {
    byBranch.set(entry.branchName!, [...(byBranch.get(entry.branchName!) ?? []), entry])
  }
  return {
    on,
    byNumber: new Map(prs.map((entry) => [entry.number, entry])),
    byBranch,
    pinned: ['main', 'development'],
    loading: false,
    error: null
  }
}

describe('Git Graph names as pull requests', () => {
  const prs = lookup([
    pr(10, 'merged', 'feature/a', 'aaa'),
    pr(12, 'open', 'feature/a', 'bbb'),
    pr(11, 'merged', 'feature/b'),
    pr(13, 'open', 'development')
  ])

  it('names a branch by the PR at its commit, else an open one', () => {
    expect(gitGraphPullRequestForBranch(prs, 'feature/a', 'aaa')?.number).toBe(10)
    expect(gitGraphPullRequestForBranch(prs, 'feature/a', 'zzz')?.number).toBe(12)
    expect(gitGraphPullRequestForBranch(prs, 'feature/b')?.number).toBe(11)
  })

  it('keeps pinned branch names and branches without a PR', () => {
    expect(gitGraphPullRequestForBranch(prs, 'development')).toBeUndefined()
    expect(gitGraphPullRequestForBranch(prs, 'feature/none')).toBeUndefined()
  })

  it('finds a merge by the number in its message, else its branch merged PR', () => {
    expect(gitGraphPullRequestForMerge(prs, '#12', 'feature/x')?.number).toBe(12)
    expect(gitGraphPullRequestForMerge(prs, undefined, 'feature/a')?.number).toBe(10)
    expect(gitGraphPullRequestForMerge(prs, undefined, 'development')).toBeUndefined()
  })

  it('does nothing while names are branches', () => {
    const off = lookup([pr(10, 'merged', 'feature/a')], false)
    expect(gitGraphPullRequestForBranch(off, 'feature/a')).toBeUndefined()
    expect(gitGraphPullRequestForMerge(off, '#10', 'feature/a')).toBeUndefined()
  })
})
