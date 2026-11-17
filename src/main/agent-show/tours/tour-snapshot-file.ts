import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { AgentShowTourSnapshot } from '../../../shared/agent-show/agent-show-tour-library'
import { tourSnapshotPath } from '../../../shared/agent-show/tour-snapshot-path'

const MAX_SNAPSHOT_CHARS = 2_000_000

/**
 * Writes a tour's "as it was" text to a read-only file in this computer's temp folder, named so
 * the editor reads back the repo path and commit (tab title, Copy Path, a restored tab). The text
 * comes from the worktree's host, which may be another machine.
 */
export async function writeTourSnapshotFile(
  tempDir: string,
  snapshot: AgentShowTourSnapshot
): Promise<string> {
  const { commit, path, text } = snapshot
  if (!/^[0-9a-f]{7,64}$/i.test(commit)) {
    throw new Error('invalid_argument: commit must be a hex id')
  }
  const parts = path.split('/')
  if (
    !path ||
    path.startsWith('/') ||
    path.includes('\\') ||
    parts.some((p) => !p || p === '..' || p === '.')
  ) {
    throw new Error('invalid_argument: the path must be worktree-relative')
  }
  if (typeof text !== 'string' || text.length > MAX_SNAPSHOT_CHARS) {
    throw new Error('invalid_argument: the snapshot text is missing or too large')
  }
  const target = tourSnapshotPath(tempDir, commit, path)
  await mkdir(dirname(target), { recursive: true })
  await chmod(target, 0o644).catch(() => undefined)
  await writeFile(target, text)
  await chmod(target, 0o444)
  return target
}
