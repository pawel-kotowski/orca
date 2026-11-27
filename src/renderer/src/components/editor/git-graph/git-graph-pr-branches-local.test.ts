import { describe, expect, it } from 'vitest'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import {
  gitGraphBranchStateRule,
  gitGraphItemsWithoutRefs,
  narrowGitGraphRefs
} from './git-graph-pr-branches'
import type { GitGraphPullRequest, GitGraphPullRequests } from './use-git-graph-pull-requests'

const local = (name: string): GitHistoryItemRef => ({
  id: `refs/heads/${name}`,
  name,
  category: 'branches',
  revision: `${name}-sha`
})
const remote = (name: string): GitHistoryItemRef => ({
  id: `refs/remotes/${name}`,
  name,
  category: 'remote branches',
  revision: `${name}-sha`
})
const tag = (name: string): GitHistoryItemRef => ({
  id: `refs/tags/${name}`,
  name,
  category: 'tags',
  revision: `${name}-sha`
})

const pr = (
  number: number,
  branchName: string,
  state: GitGraphPullRequest['state'],
  baseName = 'test'
): GitGraphPullRequest => ({ number, title: branchName, state, url: '', branchName, baseName })

function prsOf(list: GitGraphPullRequest[]): GitGraphPullRequests {
  const byBranch = new Map<string, GitGraphPullRequest[]>()
  for (const entry of list) {
    byBranch.set(entry.branchName!, [...(byBranch.get(entry.branchName!) ?? []), entry])
  }
  return {
    on: false,
    byNumber: new Map(list.map((entry) => [entry.number, entry])),
    byBranch,
    pinned: ['main'],
    loading: false,
    error: null,
    list,
    settled: true
  }
}

// main is a trunk, test is what every PR merges into, slack-agent-x was never pushed nor opened.
const refs = [
  local('main'),
  remote('origin/test'),
  local('feature-open'),
  remote('origin/feature-open'),
  local('feature-draft'),
  remote('origin/feature-merged'),
  remote('origin/feature-closed'),
  local('slack-agent-x'),
  local('my-current-work'),
  tag('v1.0')
]
const prs = prsOf([
  pr(1, 'feature-open', 'open'),
  pr(2, 'feature-draft', 'draft'),
  pr(3, 'feature-merged', 'merged'),
  pr(4, 'feature-closed', 'closed')
])
const keep = { trunks: ['main', 'development'], headRefId: 'refs/heads/my-current-work' }

describe('gitGraphBranchStateRule', () => {
  it('hides branches without a PR, keeping trunks, PR targets, the current branch and tags', () => {
    const rule = gitGraphBranchStateRule(refs, prs, {
      ...keep,
      states: ['open', 'draft', 'merged', 'closed']
    })
    expect([...rule.hidden]).toEqual([['refs/heads/slack-agent-x', 'none']])
    expect(rule.shown).toContain('refs/remotes/origin/test')
    expect(rule.shown).toContain('refs/heads/my-current-work')
    expect(rule.shown).toContain('refs/tags/v1.0')
    expect(rule.counts).toEqual({ open: 2, draft: 1, merged: 1, closed: 1, none: 1 })
  })

  it('shows only the branches not merged yet', () => {
    const rule = gitGraphBranchStateRule(refs, prs, { ...keep, states: ['open', 'draft'] })
    expect([...rule.hidden.keys()].sort()).toEqual([
      'refs/heads/slack-agent-x',
      'refs/remotes/origin/feature-closed',
      'refs/remotes/origin/feature-merged'
    ])
    expect(rule.shown).toEqual(
      [
        'refs/heads/feature-draft',
        'refs/heads/feature-open',
        'refs/heads/main',
        'refs/heads/my-current-work',
        'refs/remotes/origin/feature-open',
        'refs/remotes/origin/test',
        'refs/tags/v1.0'
      ].sort()
    )
  })

  it('shows only the merged ones', () => {
    const rule = gitGraphBranchStateRule(refs, prs, { ...keep, states: ['merged'] })
    expect(rule.shown).toContain('refs/remotes/origin/feature-merged')
    expect(rule.hidden.get('refs/heads/feature-open')).toBe('open')
    expect(rule.hidden.get('refs/heads/feature-draft')).toBe('draft')
  })
})

describe('narrowGitGraphRefs', () => {
  it("narrows every branch, or the picker's own pick, to what the filter keeps", () => {
    expect(narrowGitGraphRefs('all', ['a', 'b'])).toEqual(['a', 'b'])
    expect(narrowGitGraphRefs(['a', 'c'], ['a', 'b'])).toEqual(['a'])
    // A pick the filter empties falls back to what it keeps rather than an empty graph.
    expect(narrowGitGraphRefs(['c'], ['a', 'b'])).toEqual(['a', 'b'])
    expect(narrowGitGraphRefs('head', ['a'])).toBe('head')
  })
})

describe('gitGraphItemsWithoutRefs', () => {
  it("drops a hidden branch's name from a commit another branch still draws", () => {
    const items = [
      {
        id: 't1',
        parentIds: [],
        subject: 'test tip',
        message: 'test tip',
        references: [remote('origin/test'), local('slack-agent-x')]
      }
    ]
    const hidden = new Map([['refs/heads/slack-agent-x', 'none']])
    expect(gitGraphItemsWithoutRefs(items, hidden)[0]!.references).toEqual([remote('origin/test')])
    expect(gitGraphItemsWithoutRefs(items, null)).toBe(items)
  })
})
