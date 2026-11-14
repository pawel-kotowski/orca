import { getRevealTarget } from '@/components/right-sidebar/file-explorer/navigation/file-explorer-paths'
import {
  isPathInsideOrEqual,
  normalizeRuntimePathForComparison,
  relativePathInsideRoot,
  resolveRuntimePath
} from '../../../../shared/cross-platform-path'

export type TreeMarkEntry = { path: string; label?: string; isDirectory: boolean }

/** One owner's marks in one worktree; every path is absolute and inside `worktreePath`. */
export type TreeMarkSet = {
  worktreePath: string
  entries: TreeMarkEntry[]
  dimOthers: boolean
}

export type TreeRowMark = { marked: boolean; label?: string; dimmed: boolean }

/** Absolute path of an entry the agent named, or null when it points outside the worktree. */
export function resolveTreeEntryPath(worktreePath: string, rawPath: string): string | null {
  const absolute = resolveRuntimePath(worktreePath, rawPath)
  const relative = relativePathInsideRoot(worktreePath, absolute)
  return relative === null || relative === '' ? null : absolute
}

/** Folders to open so the entry's row exists, outermost first (the worktree root is not a row). */
export function treeEntryAncestors(worktreePath: string, entryPath: string): string[] {
  return getRevealTarget(worktreePath, entryPath)?.ancestorDirs ?? []
}

type SetLookup = {
  worktreePath: string
  dimOthers: boolean
  marked: Map<string, string | undefined>
  keptDirs: Set<string>
  markedFolders: string[]
}

export type TreeMarkIndex = { sets: SetLookup[] }

const key = normalizeRuntimePathForComparison

export function buildTreeMarkIndex(sets: Iterable<TreeMarkSet>): TreeMarkIndex {
  const lookups: SetLookup[] = []
  for (const set of sets) {
    const lookup: SetLookup = {
      worktreePath: set.worktreePath,
      dimOthers: set.dimOthers,
      marked: new Map(),
      keptDirs: new Set(),
      markedFolders: []
    }
    for (const entry of set.entries) {
      lookup.marked.set(key(entry.path), entry.label)
      for (const dir of treeEntryAncestors(set.worktreePath, entry.path)) {
        lookup.keptDirs.add(key(dir))
      }
      if (entry.isDirectory) {
        lookup.markedFolders.push(entry.path)
      }
    }
    lookups.push(lookup)
  }
  return { sets: lookups }
}

/** What one explorer row shows: highlighted with a label, dimmed, or untouched. */
export function rowTreeMark(index: TreeMarkIndex, rowPath: string): TreeRowMark {
  const rowKey = key(rowPath)
  let marked = false
  let label: string | undefined
  let kept = false
  let dimming = false
  for (const set of index.sets) {
    if (relativePathInsideRoot(set.worktreePath, rowPath) === null) {
      continue
    }
    if (set.marked.has(rowKey)) {
      marked = true
      label ??= set.marked.get(rowKey)
    }
    if (set.dimOthers) {
      dimming = true
      kept ||=
        set.marked.has(rowKey) ||
        set.keptDirs.has(rowKey) ||
        set.markedFolders.some((folder) => isPathInsideOrEqual(folder, rowPath))
    }
  }
  return { marked, ...(label ? { label } : {}), dimmed: dimming && !marked && !kept }
}
