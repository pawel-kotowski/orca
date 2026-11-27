// Local (glass build): the Git Graph's Branches view. Only the commits that shape the history stay:
// branch and tag tips, merges, fork points (a commit two lines grew from), roots and HEAD. Every
// plain commit between them folds into the line it sits on, so the graph shows how branches split
// and came back together, and each kept commit knows which commits it folded.
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'

export type GitGraphOutline = {
  items: GitHistoryItem[]
  /**
   * Commits folded into the line from a kept commit to its parent, newest first, keyed
   * `child>parent index`: a merge whose two lines fold down to the same commit has two edges.
   */
  foldedByEdge: Map<string, string[]>
}

export function gitGraphEdgeKey(childId: string, parentIndex: number): string {
  return `${childId}>${parentIndex}`
}

export function outlineGitGraphItems(
  items: readonly GitHistoryItem[],
  headRevision?: string,
  /** More commits that shape the history: pull requests squashed onto a pinned branch. */
  alsoKeep?: (item: GitHistoryItem) => boolean,
  /**
   * Merges read as plain commits of their own line (a base branch merged into a PR's branch,
   * git-graph-sync-merges.ts): no row of their own, and no line to what they took in.
   */
  foldMerge?: (item: GitHistoryItem) => boolean
): GitGraphOutline {
  const byId = new Map(items.map((item) => [item.id, item]))
  const parentsOf = (item: GitHistoryItem): string[] =>
    item.parentIds.length > 1 && foldMerge?.(item) ? item.parentIds.slice(0, 1) : item.parentIds
  const children = new Map<string, number>()
  for (const item of items) {
    for (const parent of parentsOf(item)) {
      children.set(parent, (children.get(parent) ?? 0) + 1)
    }
  }
  const kept = (item: GitHistoryItem): boolean =>
    item.id === headRevision ||
    (item.references?.length ?? 0) > 0 ||
    parentsOf(item).length !== 1 ||
    (children.get(item.id) ?? 0) > 1 ||
    !!alsoKeep?.(item)
  const keptIds = new Set(items.filter(kept).map((item) => item.id))
  // A list whose first rows fold (paged in mid-line) still starts somewhere.
  if (items[0]) {
    keptIds.add(items[0].id)
  }

  const foldedByEdge = new Map<string, string[]>()
  const outlined: GitHistoryItem[] = []
  for (const item of items) {
    if (!keptIds.has(item.id)) {
      continue
    }
    // Every parent stays, even when two lines fold down to the same commit: a short PR merged
    // with a merge commit is still a merge (a bubble), not a plain commit (Paweł, 2026-11-17:
    // three PR merges read "fork on main" once their one-commit branches had folded away).
    const parentIds = parentsOf(item).map((parent, index) => {
      // A folded commit has one parent (a folded merge: its first) and one child, so its line is
      // a plain chain.
      let id = parent
      const folded: string[] = []
      let next = byId.get(id)
      while (next && !keptIds.has(id)) {
        folded.push(id)
        id = next.parentIds[0]!
        next = byId.get(id)
      }
      foldedByEdge.set(gitGraphEdgeKey(item.id, index), folded)
      return id
    })
    outlined.push({ ...item, parentIds })
  }
  return { items: outlined, foldedByEdge }
}
