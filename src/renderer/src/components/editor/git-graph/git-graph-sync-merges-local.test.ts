import { describe, expect, it } from 'vitest'
import type {
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'
import { GIT_GRAPH_DEFAULT_TRUNKS, gitGraphLaneNames } from './git-graph-lane-names'
import { gitGraphEdgeKey, outlineGitGraphItems } from './git-graph-outline'
import { gitGraphMergeSourceAndTarget, gitGraphSyncMerges } from './git-graph-sync-merges'

const branch = (name: string): GitHistoryItemRef => ({
  id: `refs/heads/${name}`,
  name,
  category: 'branches'
})
const remote = (name: string): GitHistoryItemRef => ({
  id: `refs/remotes/${name}`,
  name,
  category: 'remote branches'
})

function commit(
  id: string,
  parentIds: string[],
  subject = id,
  references: GitHistoryItemRef[] = []
): GitHistoryItem {
  return { id, parentIds, subject, message: subject, references }
}

function outlineOf(items: GitHistoryItem[], trunks: readonly string[] = GIT_GRAPH_DEFAULT_TRUNKS) {
  const folded = gitGraphSyncMerges(items, gitGraphLaneNames(items, trunks), trunks)
  return {
    folded,
    outline: outlineGitGraphItems(items, undefined, undefined, (item) => folded.has(item.id))
  }
}

describe('gitGraphMergeSourceAndTarget', () => {
  it("reads git's, GitHub's and hand-written merge messages", () => {
    expect(
      gitGraphMergeSourceAndTarget("Merge remote-tracking branch 'origin/test' into TASK-113-x")
    ).toEqual({ source: 'origin/test', target: 'TASK-113-x' })
    expect(gitGraphMergeSourceAndTarget("Merge branch 'test' into feature/x")).toEqual({
      source: 'test',
      target: 'feature/x'
    })
    expect(gitGraphMergeSourceAndTarget('chore: merge origin/test into TASK-108-a')).toEqual({
      source: 'origin/test',
      target: 'TASK-108-a'
    })
    expect(gitGraphMergeSourceAndTarget('Merge origin/test into TASK-110-b')).toEqual({
      source: 'origin/test',
      target: 'TASK-110-b'
    })
    expect(gitGraphMergeSourceAndTarget("Merge branch 'x' of github.com:acme/app into x")).toEqual({
      source: 'x',
      target: 'x'
    })
    expect(gitGraphMergeSourceAndTarget("Merge branch 'fix' into 'main'")).toEqual({
      source: 'fix',
      target: 'main'
    })
    expect(gitGraphMergeSourceAndTarget('Merge pull request #3 from acme/feat')).toBeUndefined()
  })
})

describe('a base branch merged into a PR branch', () => {
  // test: t3 ─ t2 ─ t1 ─ m (main). feature-x started at t1 and took test in at t2 (X2).
  const items = [
    commit('x3', ['X2'], 'feature x, later', [branch('feature-x')]),
    commit('t3', ['t2'], 'docs (#130)', [remote('origin/test')]),
    commit('X2', ['x1', 't2'], "Merge remote-tracking branch 'origin/test' into feature-x"),
    commit('t2', ['t1'], 'feat (#129)'),
    commit('x1', ['t1'], 'feature x starts'),
    commit('t1', ['m'], 'fix (#128)'),
    commit('m', [], 'main', [remote('origin/main')])
  ]

  it('folds the merge into the PR line, and the base commit it took in is no fork point', () => {
    const { folded, outline } = outlineOf(items)
    expect([...folded]).toEqual(['X2'])
    expect(outline.items.map((item) => item.id)).toEqual(['x3', 't3', 't1', 'm'])
    expect(outline.items.find((item) => item.id === 'x3')!.parentIds).toEqual(['t1'])
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('x3', 0))).toEqual(['X2', 'x1'])
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('t3', 0))).toEqual(['t2'])
  })

  it('keeps the merge as a tip row, with no line to the base, when it is the branch tip', () => {
    const tip = [
      commit('X2', ['x1', 't2'], "Merge branch 'test' into feature-x", [branch('feature-x')]),
      ...items.filter((item) => item.id !== 'x3' && item.id !== 'X2')
    ]
    const { outline } = outlineOf(tip)
    expect(outline.items.find((item) => item.id === 'X2')!.parentIds).toEqual(['t1'])
  })
})

describe('merges that stay', () => {
  it('keeps GitHub landings, merges into long-lived branches and pinned ones', () => {
    const items = [
      commit('L', ['t1', 'f1'], 'Merge pull request #5 from acme/feature', [remote('origin/test')]),
      commit('M', ['m1', 't1'], "Merge branch 'test' into main", [branch('main')]),
      commit('f1', ['t1'], 'feature', [branch('feature')]),
      commit('t1', ['m1']),
      commit('m1', [])
    ]
    expect(outlineOf(items, ['main', 'test']).folded.size).toBe(0)
  })

  it('keeps a merge whose commits show nowhere else (a deleted branch merged into a PR)', () => {
    const items = [
      commit('P', ['p1', 'd1'], "Merge branch 'spike' into feature", [branch('feature')]),
      commit('d1', ['p1'], 'spike, branch deleted'),
      commit('p1', [], 'feature start', [branch('main')])
    ]
    expect(outlineOf(items).folded.size).toBe(0)
  })

  it('keeps merges into an integration branch that takes in several branches', () => {
    const items = [
      commit('I2', ['I1', 'b1'], "Merge branch 'agent-show' into local/glass", [
        branch('local/glass')
      ]),
      commit('b1', ['m'], 'tours', [branch('agent-show')]),
      commit('I1', ['m', 'a1'], "Merge branch 'session-live' into local/glass"),
      commit('a1', ['m'], 'session', [branch('session-live')]),
      commit('m', [], 'upstream', [remote('origin/main')])
    ]
    expect(outlineOf(items).folded.size).toBe(0)
  })

  it('keeps a merge with no "into" that took in a branch that is not long-lived', () => {
    const items = [
      commit('I', ['g1', 'b1'], 'Merge agent-show: tours', [branch('local/glass')]),
      commit('b1', ['g1'], 'tours', [branch('agent-show')]),
      commit('g1', [], 'glass', [branch('local/glass-pre-1')])
    ]
    expect(outlineOf(items).folded.size).toBe(0)
  })
})

describe('a stack of pull requests', () => {
  it('folds the lower PR merged into the upper one, and main merged into the lower one', () => {
    const items = [
      commit('U2', ['u1', 'L2'], "Merge branch 'lower' into upper", [branch('upper')]),
      commit('L2', ['l1', 'm2'], 'Merge origin/main', [branch('lower')]),
      commit('m2', ['m1'], 'main moved', [remote('origin/main')]),
      commit('u1', ['l1'], 'upper work'),
      commit('l1', ['m1'], 'lower work'),
      commit('m1', [], 'main')
    ]
    expect([...outlineOf(items).folded].sort()).toEqual(['L2', 'U2'])
  })
})

describe('a merge-commit workflow', () => {
  it('folds a PR branch syncing main even after the PR landed with a merge commit', () => {
    const items = [
      commit('L', ['m2', 'X2'], 'Merge pull request #5 from acme/feature-x', [branch('main')]),
      commit('X2', ['x1', 'm1'], "Merge branch 'main' into feature-x", [
        remote('origin/feature-x')
      ]),
      commit('m2', ['m1'], 'other work'),
      commit('x1', ['m0'], 'feature x'),
      commit('m1', ['m0']),
      commit('m0', [])
    ]
    expect([...outlineOf(items).folded]).toEqual(['X2'])
  })
})
