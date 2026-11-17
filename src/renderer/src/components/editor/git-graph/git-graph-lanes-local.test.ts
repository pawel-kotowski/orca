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
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('M', 'F'))).toBe(2)
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('M', 'm2'))).toBe(0)
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
    expect(outline.foldedByEdge.get(gitGraphEdgeKey('a', 'd'))).toBe(2)
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
