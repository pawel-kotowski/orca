// Local (glass build): the Git Graph's Branches view. Only the commits that shape the history stay:
// branch and tag tips, merges, fork points (a commit two lines grew from), roots and HEAD. Every
// plain commit between them folds into the line it sits on, so the graph shows how branches split
// and came back together, and each kept commit knows how many commits it folded.
import type { GitHistoryItem } from '../../../../../shared/git/history/git-history-types'

export type GitGraphOutline = {
  items: GitHistoryItem[]
  /** Commits folded into the line from a kept commit to its parent, keyed `child>parent`. */
  foldedByEdge: Map<string, number>
}

export function gitGraphEdgeKey(childId: string, parentId: string): string {
  return `${childId}>${parentId}`
}

export function outlineGitGraphItems(
  items: readonly GitHistoryItem[],
  headRevision?: string
): GitGraphOutline {
  const byId = new Map(items.map((item) => [item.id, item]))
  const children = new Map<string, number>()
  for (const item of items) {
    for (const parent of item.parentIds) {
      children.set(parent, (children.get(parent) ?? 0) + 1)
    }
  }
  const kept = (item: GitHistoryItem): boolean =>
    item.id === headRevision ||
    (item.references?.length ?? 0) > 0 ||
    item.parentIds.length !== 1 ||
    (children.get(item.id) ?? 0) > 1
  const keptIds = new Set(items.filter(kept).map((item) => item.id))
  // A list whose first rows fold (paged in mid-line) still starts somewhere.
  if (items[0]) {
    keptIds.add(items[0].id)
  }

  const foldedByEdge = new Map<string, number>()
  const outlined: GitHistoryItem[] = []
  for (const item of items) {
    if (!keptIds.has(item.id)) {
      continue
    }
    const parentIds: string[] = []
    for (const parent of item.parentIds) {
      // A folded commit has exactly one parent and one child, so its line is a plain chain.
      let id = parent
      let folded = 0
      let next = byId.get(id)
      while (next && !keptIds.has(id)) {
        folded += 1
        id = next.parentIds[0]!
        next = byId.get(id)
      }
      if (!parentIds.includes(id)) {
        parentIds.push(id)
        foldedByEdge.set(gitGraphEdgeKey(item.id, id), folded)
      }
    }
    outlined.push({ ...item, parentIds })
  }
  return { items: outlined, foldedByEdge }
}
