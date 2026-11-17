import { describe, expect, it } from 'vitest'
import type {
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'
import {
  gitGraphLaneNames,
  gitGraphMergedBranchName,
  gitGraphMergeTargetName
} from './git-graph-lane-names'
import { gitGraphEdgeKey, outlineGitGraphItems } from './git-graph-outline'
import { findGitGraphTrunk } from './use-git-graph-jump'
import { groupGitGraphRefs } from './git-graph-ref-chips'
import { buildGitGraphBranchViewModels, gitGraphBranchColours } from './git-graph-branch-layout'
import { defaultGitGraphPinnedLanes } from './use-git-graph-pinned-lanes'

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

// main:    M ─ m2 ─ F ─ root
//           \       /
// feature:   f2 ─ f1     (merged, branch deleted)
// topic:  t1 off m2, still open
const history: GitHistoryItem[] = [
  commit('t1', ['m2'], 'topic work', [branch('topic/very-long-name')]),
  commit('M', ['m2', 'f2'], 'Merge pull request #12 from acme/feature/login', [
    branch('main'),
    remote('origin/main')
  ]),
  commit('f2', ['f1']),
  commit('m2', ['F']),
  commit('f1', ['F']),
  commit('F', ['root']),
  commit('root', [])
]

describe('merge messages', () => {
  it('reads the merged branch from git, GitHub and GitLab messages', () => {
    expect(gitGraphMergedBranchName("Merge branch 'feature/x'")).toBe('feature/x')
    expect(gitGraphMergedBranchName("Merge branch 'feature/x' into develop")).toBe('feature/x')
    expect(gitGraphMergedBranchName("Merge branch 'fix' into 'main'")).toBe('fix')
    expect(gitGraphMergedBranchName("Merge remote-tracking branch 'origin/hotfix'")).toBe('hotfix')
    expect(gitGraphMergedBranchName('Merge pull request #3 from someone/feat/a/b')).toBe('feat/a/b')
    expect(gitGraphMergedBranchName('Add a button')).toBeUndefined()
    expect(gitGraphMergeTargetName("Merge branch 'fix' into 'main'")).toBe('main')
    expect(gitGraphMergeTargetName("Merge branch 'fix' into develop")).toBe('develop')
  })
})

describe('gitGraphLaneNames', () => {
  it('names a line by its tip, a merged branch by its merge, and keeps fork points on the trunk', () => {
    const names = gitGraphLaneNames(history)
    expect(names.get('t1')).toBe('topic/very-long-name')
    expect(names.get('M')).toBe('main')
    expect(names.get('m2')).toBe('main')
    expect(names.get('f2')).toBe('feature/login')
    expect(names.get('f1')).toBe('feature/login')
    expect(names.get('F')).toBe('main')
    expect(names.get('root')).toBe('main')
  })
})

describe('outlineGitGraphItems', () => {
  it('keeps tips, merges and fork points, and counts what each line folded', () => {
    const outline = outlineGitGraphItems(history)
    expect(outline.items.map((item) => item.id)).toEqual(['t1', 'M', 'm2', 'F', 'root'])
    const merge = outline.items.find((item) => item.id === 'M')!
    expect(merge.parentIds).toEqual(['m2', 'F'])
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('M', 'F'))).toEqual(['f2', 'f1'])
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('M', 'm2'))).toEqual([])
  })

  it('folds a plain run into the commit above it', () => {
    const run = [
      commit('a', ['b'], 'a', [branch('main')]),
      commit('b', ['c']),
      commit('c', ['d']),
      commit('d', [])
    ]
    const outline = outlineGitGraphItems(run)
    expect(outline.items.map((item) => item.id)).toEqual(['a', 'd'])
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('a', 'd'))).toEqual(['b', 'c'])
  })
})

describe('jumps and labels', () => {
  it('finds main and development, local first, then on a remote', () => {
    const refs = [
      { ...remote('origin/main'), revision: 'a' },
      { ...remote('origin/development'), revision: 'b' },
      { ...branch('master'), revision: 'c' }
    ]
    expect(findGitGraphTrunk(refs, ['main', 'master'])?.label).toBe('master')
    expect(findGitGraphTrunk(refs, ['develop', 'development'])?.label).toBe('origin/development')
    expect(findGitGraphTrunk(refs, ['trunk'])).toBeUndefined()
  })

  it('shows a pushed branch once, with its remote after it', () => {
    const groups = groupGitGraphRefs(
      [branch('main'), remote('origin/main'), remote('origin/HEAD'), remote('upstream/x')],
      'refs/heads/main'
    )
    expect(groups).toEqual([
      expect.objectContaining({ name: 'main', syncedRemotes: ['origin'], isHead: true }),
      expect.objectContaining({ kind: 'remote', name: 'x', remote: 'upstream' })
    ])
  })
})

describe('buildGitGraphBranchViewModels', () => {
  // A feature tip newer than main's: plain layout would open the feature's lane first (left).
  const items = [
    commit('x2', ['x1'], 'feature work', [branch('feature/x')]),
    commit('d1', ['m1'], 'development work', [branch('development')]),
    commit('x1', ['m1'], 'feature start'),
    commit('m1', ['m0'], 'main tip', [branch('main')]),
    commit('m0', [], 'root')
  ]
  const pinned = ['main', 'development']
  const laneNames = gitGraphLaneNames(items, pinned)
  const colourOf = gitGraphBranchColours(items, laneNames, pinned, 'feature/x')
  const rows = buildGitGraphBranchViewModels(items, { laneNames, pinned, colourOf })
  const byId = new Map(rows.map((row) => [row.historyItem.id, row]))

  it('keeps a column for each pinned branch from the top, others to the right of them', () => {
    // Above main's and development's tips their columns are already there, empty: the feature
    // starts in column 3 and never moves (Paweł: "start one col to the right, not curve").
    const colours = (id: string) => byId.get(id)!.outputSwimlanes.map((lane) => lane.color)
    expect(colours('x2')).toEqual([
      'git-graph-branch-empty',
      'git-graph-branch-empty',
      'git-graph-branch-head'
    ])
    expect(colours('d1')).toEqual([
      'git-graph-branch-empty',
      'git-graph-branch-pin-2',
      'git-graph-branch-head'
    ])
    expect(byId.get('x2')!.circleIndex).toBe(2)
    expect(byId.get('d1')!.circleIndex).toBe(1)
    expect(byId.get('m1')!.circleIndex).toBe(0)
    // Nothing bends: every lane that goes on stays in its column.
    for (const row of rows) {
      for (const edge of row.edges) {
        if (typeof edge.from === 'number' && typeof edge.to === 'number') {
          expect(edge.to).toBe(edge.from)
        }
      }
    }
  })

  it('gives each branch one colour, pinned ones fixed and the current branch its own', () => {
    expect(byId.get('x2')!.nodeColor).toBe('git-graph-branch-head')
    expect(byId.get('x1')!.nodeColor).toBe('git-graph-branch-head')
    expect(byId.get('d1')!.nodeColor).toBe('git-graph-branch-pin-2')
    expect(byId.get('m1')!.nodeColor).toBe('git-graph-branch-pin-1')
    // The feature's last commit still draws the feature's line down to where it forked.
    const toFork = byId.get('x1')!.edges.find((edge) => edge.from === 'node')!
    expect(toFork.color).toBe('git-graph-branch-head')
  })

  it('connects every lane of a row from where it was to where it goes', () => {
    for (const row of rows) {
      const into = row.edges.filter((edge) => edge.to !== 'node').map((edge) => edge.to)
      const drawn = row.outputSwimlanes
        .map((lane, index) => (lane.color === 'git-graph-branch-empty' ? -1 : index))
        .filter((index) => index !== -1)
      expect(into).toEqual(drawn)
    }
  })
})

describe('a pinned branch whose tip is not loaded yet', () => {
  it('keeps its column when the graph draws it, so loading it moves nothing', () => {
    const items = [commit('a', ['b'], 'a', [branch('feature')]), commit('b', [], 'b')]
    const laneNames = gitGraphLaneNames(items, ['main'])
    const colourOf = gitGraphBranchColours(items, laneNames, ['main'], undefined)
    const build = (drawn: string[]) =>
      buildGitGraphBranchViewModels(items, { laneNames, pinned: ['main'], colourOf, drawn })[0]!
    expect(build(['main']).circleIndex).toBe(1)
    expect(build([]).circleIndex).toBe(0)
  })
})

describe('defaultGitGraphPinnedLanes', () => {
  it('pins the repo main branch, then its development branch', () => {
    expect(defaultGitGraphPinnedLanes([remote('origin/development'), branch('master')])).toEqual([
      'master',
      'development'
    ])
    expect(defaultGitGraphPinnedLanes([branch('feature')])).toEqual([])
  })
})
