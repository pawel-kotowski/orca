// Why one module both ways: main writes "as it was" copies here, and the editor names a copy by
// reading its repo path and commit back out of where it lives (so a restored tab keeps its name).
const FOLDER = 'orca-tour-snapshots'

/** Where the copy of `path` (worktree-relative, `/`-separated) at `commit` lives under `tempDir`. */
export function tourSnapshotPath(tempDir: string, commit: string, path: string): string {
  const short = commit.slice(0, 7)
  const parts = path.split('/')
  const name = parts.pop()!
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const extension = dot > 0 ? name.slice(dot) : ''
  const separator = tempDir.includes('\\') && !tempDir.includes('/') ? '\\' : '/'
  return [
    tempDir.replace(/[\\/]+$/, ''),
    FOLDER,
    short,
    ...parts,
    `${stem}@${short}${extension}`
  ].join(separator)
}

/** The repo path and commit a snapshot copy stands for, or null for any other file. */
export function tourSnapshotOrigin(filePath: string): { path: string; commit: string } | null {
  const parts = filePath.split(/[\\/]/)
  const at = parts.lastIndexOf(FOLDER)
  const short = parts[at + 1]
  const name = parts.at(-1)
  if (at === -1 || !short || !/^[0-9a-f]{7}$/i.test(short) || !name || parts.length < at + 3) {
    return null
  }
  const match = new RegExp(`^(.*)@${short}(\\.[^.]*)?$`).exec(name)
  if (!match?.[1]) {
    return null
  }
  return {
    path: [...parts.slice(at + 2, -1), `${match[1]}${match[2] ?? ''}`].join('/'),
    commit: short
  }
}
