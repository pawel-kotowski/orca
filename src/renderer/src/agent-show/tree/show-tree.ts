import type {
  AgentShowContext,
  AgentShowHandler
} from '../../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store/index'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { requireRuntimeTargetForFileOwner } from '@/lib/files/access/file-owner-runtime-target'
import { statRuntimePath } from '@/runtime/files/metadata/runtime-file-metadata-client'
import type { RuntimeFileOperationArgs } from '@/runtime/files/runtime-file-client-types'
import { resolveTreeEntryPath, treeEntryAncestors, type TreeMarkEntry } from './tree-mark-index'
import { clearTreeMarkSet, getTreeMarkSet, setTreeMarkSet } from './tree-marks-store'
import { waitForTreeRowInView } from './tree-first-row-visible'

function ownerKeyOf(context: AgentShowContext): string {
  return context.ownerTabId ?? `worktree:${context.worktreeId}`
}

function expandDirs(worktreeId: string, dirs: string[]): void {
  useAppStore.setState((state) => {
    const current = state.expandedDirs[worktreeId] ?? new Set<string>()
    if (dirs.every((dir) => current.has(dir))) {
      return state
    }
    return { expandedDirs: { ...state.expandedDirs, [worktreeId]: new Set([...current, ...dirs]) } }
  })
}

export const showTree: AgentShowHandler<'tree'> = async (request, context) => {
  const store = useAppStore.getState()
  const fileContext: RuntimeFileOperationArgs = {
    target: requireRuntimeTargetForFileOwner(store, context.worktreeId, undefined),
    worktreeId: context.worktreeId,
    worktreePath: context.worktreePath,
    connectionId: getConnectionId(context.worktreeId) ?? undefined
  }

  const resolved = await Promise.all(
    request.entries.map(async ({ path, label }) => {
      const absolute = resolveTreeEntryPath(context.worktreePath, path)
      if (!absolute) {
        return { missing: path }
      }
      try {
        const stat = await statRuntimePath(fileContext, absolute)
        return { entry: { path: absolute, label, isDirectory: stat.isDirectory } as TreeMarkEntry }
      } catch {
        return { missing: path }
      }
    })
  )
  const entries = resolved.flatMap((r) => ('entry' in r && r.entry ? [r.entry] : []))
  const missing = resolved.flatMap((r) => ('missing' in r && r.missing ? [r.missing] : []))
  if (entries.length === 0) {
    return {
      ok: false,
      code: 'path_not_found',
      message: `none of the paths exist in this worktree: ${missing.join(', ')}`
    }
  }

  setTreeMarkSet(ownerKeyOf(context), {
    worktreePath: context.worktreePath,
    entries,
    dimOthers: request.dimOthers
  })

  const dirs = entries.flatMap((entry) => [
    ...treeEntryAncestors(context.worktreePath, entry.path),
    ...(request.expand && entry.isDirectory ? [entry.path] : [])
  ])
  expandDirs(context.worktreeId, dirs)
  // Why one reveal: it opens the files view and scrolls to the first entry; the other rows are
  // already expanded above, and each reveal call would scroll again.
  store.revealInExplorer(context.worktreeId, entries[0].path)

  const visible = await waitForTreeRowInView(entries[0].path)
  return {
    ok: true,
    visible,
    ...(missing.length > 0 ? { detail: `not found: ${missing.join(', ')}` } : {})
  }
}

export function clearTreeMarks(context: AgentShowContext): void {
  clearTreeMarkSet(ownerKeyOf(context))
}

export function treeMarksFor(context: AgentShowContext): string[] {
  return getTreeMarkSet(ownerKeyOf(context))?.entries.map((entry) => entry.path) ?? []
}
