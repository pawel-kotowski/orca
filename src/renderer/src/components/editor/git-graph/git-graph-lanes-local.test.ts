import { describe, expect, it } from 'vitest'
import type {
  GitHistoryItem,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'
import {
  gitGraphLaneNames,
  gitGraphMergedBranchName,
  gitGraphMergedPullRequest,
  gitGraphMergeTargetName
} from './git-graph-lane-names'
import { gitGraphEdgeKey, outlineGitGraphItems } from './git-graph-outline'
import { findGitGraphTrunk } from './use-git-graph-jump'
import { groupGitGraphRefs } from './git-graph-ref-chips'
import { buildGitGraphBranchViewModels, gitGraphBranchColours } from './git-graph-branch-layout'
import { defaultGitGraphPinnedLanes } from './use-git-graph-pinned-lanes'
import { gitGraphBranchRuns } from './git-graph-branch-frames'
import { isGitGraphMergeInto, nextGitGraphMark } from './use-git-graph-merge-marks'
import { findGitGraphCommit } from './git-graph-find'
import { gitGraphPeople } from './git-graph-author-color'

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
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('M', 1))).toEqual(['f2', 'f1'])
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('M', 0))).toEqual([])
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
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('a', 0))).toEqual(['b', 'c'])
  })
})

describe('a PR merged with a merge commit', () => {
  it('stays a merge when both its lines fold down to the same commit', () => {
    // main: M (#12) ─ P, with the PR's one commit f off P; then P ─ root.
    const outline = outlineGitGraphItems([
      commit('M', ['P', 'f'], 'feat: walks in My Day (#12)', [branch('main')]),
      commit('f', ['P'], 'feat: walks'),
      commit('P', ['root'], 'previous (#11)'),
      commit('root', [])
    ])
    expect(outline.items.find((item) => item.id === 'M')!.parentIds).toEqual(['P', 'P'])
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('M', 1))).toEqual(['f'])
    expect(gitGraphMergedPullRequest('feat: walks in My Day (#12)')).toBe('#12')
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

describe('gitGraphBranchRuns', () => {
  it('frames a branch from its tip down its line until another name or its line leaves', () => {
    const items = [
      commit('a2', ['a1'], 'a2', [branch('feature/a')]),
      commit('a1', ['b2'], 'a1'),
      commit('b2', ['m1'], 'b2', [branch('feature/b')]),
      commit('m1', [], 'm1', [branch('main')])
    ]
    const laneNames = gitGraphLaneNames(items, ['main'])
    const colourOf = gitGraphBranchColours(items, laneNames, ['main'], undefined)
    const rows = buildGitGraphBranchViewModels(items, { laneNames, pinned: ['main'], colourOf })
    expect(
      gitGraphBranchRuns(rows, laneNames, ['main']).map(({ start, end }) => [start, end])
    ).toEqual([
      [0, 1],
      [2, 2]
    ])
  })
})

describe('merges into a branch', () => {
  it('finds merges on the target line and steps through them, wrapping', () => {
    const items = [
      commit('M2', ['M1', 'f2'], "Merge branch 'f2' into main", [branch('main')]),
      commit('f2', ['M1'], 'f2'),
      commit('M1', ['m0', 'f1'], "Merge branch 'f1' into main"),
      commit('f1', ['m0'], 'f1'),
      commit('m0', [], 'root')
    ]
    const laneNames = gitGraphLaneNames(items, ['main'])
    const colourOf = gitGraphBranchColours(items, laneNames, ['main'], undefined)
    const rows = buildGitGraphBranchViewModels(items, { laneNames, pinned: ['main'], colourOf })
    expect(
      rows
        .filter((row) => isGitGraphMergeInto(row, laneNames, ['main']))
        .map((row) => row.historyItem.id)
    ).toEqual(['M2', 'M1'])
    expect(nextGitGraphMark(rows, laneNames, ['main'], 'M2', 1)).toBe('M1')
    expect(nextGitGraphMark(rows, laneNames, ['main'], 'M1', 1)).toBe('M2')
    expect(nextGitGraphMark(rows, laneNames, ['main'], null, -1)).toBe('M1')
    expect(findGitGraphCommit(items, 'F1', 'M2')).toBe('M1')
  })

  it('counts a pull request squashed onto the branch, and the Branches view keeps it', () => {
    const items = [
      commit('s2', ['s1'], 'ci: skip docs-only runs (#1145)', [branch('development')]),
      commit('s1', ['s0'], 'fix(webui): ribbon (#1143)'),
      commit('w', ['s0'], 'wip on development'),
      commit('s0', [], 'root')
    ].filter((item) => item.id !== 'w')
    const laneNames = gitGraphLaneNames(items, ['development'])
    const colourOf = gitGraphBranchColours(items, laneNames, ['development'], undefined)
    const rows = buildGitGraphBranchViewModels(items, {
      laneNames,
      pinned: ['development'],
      colourOf
    })
    expect(rows.filter((row) => isGitGraphMergeInto(row, laneNames, ['development'])).length).toBe(
      2
    )
    const outline = outlineGitGraphItems(items, undefined, (item) => /\(#\d+\)$/.test(item.subject))
    expect(outline.items.map((item) => item.id)).toEqual(['s2', 's1', 's0'])
  })
})

describe('gitGraphPeople', () => {
  it('makes one person of authors sharing an email or a name', () => {
    const personOf = gitGraphPeople([
      { author: 'Paweł Kotowski', authorEmail: 'pawel@work.example' },
      { author: 'Pawel Kotowski', authorEmail: 'pawel@work.example' },
      { author: 'Paweł Kotowski', authorEmail: 'pawel@home.example' },
      { author: 'maciejmajek', authorEmail: 'maciej@work.example' },
      { author: 'Maciej Majek', authorEmail: 'maciej@users.noreply.example' },
      { author: 'Ann Lee', authorEmail: 'ann@work.example' },
      { author: 'Bartek Boczek', authorEmail: 'bartek@work.example' },
      { author: 'Bartek Boczek', authorEmail: 'bartek@work.example' },
      // GitHub's merge: the pull request author's name on the merger's address.
      { author: 'Bartek Boczek', authorEmail: 'maciej@users.noreply.example' }
    ])
    const pawel = personOf('Paweł Kotowski', 'pawel@home.example')
    expect(personOf('Pawel Kotowski', 'pawel@work.example')).toBe(pawel)
    expect(personOf('maciejmajek', 'maciej@work.example')).toBe(
      personOf('Maciej Majek', 'maciej@users.noreply.example')
    )
    expect(personOf('Ann Lee', 'ann@work.example')).not.toBe(pawel)
    expect(personOf('Bartek Boczek', 'bartek@work.example')).not.toBe(
      personOf('maciejmajek', 'maciej@work.example')
    )
  })
})
