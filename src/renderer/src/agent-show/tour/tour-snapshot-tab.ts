import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { useAppStore } from '@/store'
import { joinPath } from '@/lib/path'
import { tourSnapshotOrigin } from '../../../../shared/agent-show/tour-snapshot-path'

/**
 * For a tour's "as it was" tab, the repo file it stands for (Copy Path and Copy Relative Path give
 * these, not the temp copy's path); null for any other tab.
 */
export function tourSnapshotRepoPaths(
  file: Pick<OpenFile, 'filePath' | 'readOnly'>,
  worktreePath: string | undefined
): { absolute: string; relative: string } | null {
  const origin = file.readOnly ? tourSnapshotOrigin(file.filePath) : null
  if (!origin) {
    return null
  }
  return {
    absolute: worktreePath ? joinPath(worktreePath, origin.path) : origin.path,
    relative: origin.path
  }
}

/** The same, with the tab's worktree looked up in the store (only for an "as it was" tab). */
export function tourSnapshotRepoPathsOf(
  file: Pick<OpenFile, 'filePath' | 'readOnly' | 'worktreeId'>
): { absolute: string; relative: string } | null {
  if (!tourSnapshotRepoPaths(file, undefined)) {
    return null
  }
  return tourSnapshotRepoPaths(
    file,
    useAppStore.getState().getKnownWorktreeById(file.worktreeId)?.path
  )
}
