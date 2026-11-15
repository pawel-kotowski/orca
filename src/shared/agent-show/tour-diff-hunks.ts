/** One `@@ -oldStart,oldCount +newStart,newCount @@` hunk; a count of 0 means lines were only added or only removed. */
export type DiffHunk = { oldStart: number; oldCount: number; newStart: number; newCount: number }

/** One file of `git diff -U0` between the stamped commit and the worktree. */
export type DiffFile = {
  oldPath: string | null
  newPath: string | null
  hunks: DiffHunk[]
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

function stripPrefix(path: string, prefix: 'a/' | 'b/'): string | null {
  const trimmed = path.replace(/\t$/, '')
  if (trimmed === '/dev/null') {
    return null
  }
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed
}

/** Reads `git diff -U0 --src-prefix=a/ --dst-prefix=b/` output into files and their hunks. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files: DiffFile[] = []
  let current: DiffFile | null = null
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      // Why: a mode-only change has no ---/+++ lines; `a/<p> b/<p>` names the path.
      const path = /^diff --git a\/(.+) b\/\1$/.exec(line)?.[1] ?? null
      current = { oldPath: path, newPath: path, hunks: [] }
      files.push(current)
      continue
    }
    if (!current) {
      continue
    }
    const hunk = HUNK.exec(line)
    if (hunk) {
      current.hunks.push({
        oldStart: Number(hunk[1]),
        oldCount: hunk[2] === undefined ? 1 : Number(hunk[2]),
        newStart: Number(hunk[3]),
        newCount: hunk[4] === undefined ? 1 : Number(hunk[4])
      })
    } else if (line.startsWith('rename from ')) {
      current.oldPath = line.slice('rename from '.length)
    } else if (line.startsWith('rename to ')) {
      current.newPath = line.slice('rename to '.length)
    } else if (line.startsWith('--- ')) {
      current.oldPath = stripPrefix(line.slice(4), 'a/')
    } else if (line.startsWith('+++ ')) {
      current.newPath = stripPrefix(line.slice(4), 'b/')
    }
  }
  return files
}

export type LineRange = { startLine: number; endLine: number }

/**
 * Where a range of the stamped file is now: shifted by the edits above it, or null when an edit
 * touched the range itself (a line inside it changed, or lines were added between its lines).
 */
export function mapRangeThroughHunks(
  range: LineRange,
  hunks: readonly DiffHunk[]
): LineRange | null {
  let shift = 0
  for (const hunk of hunks) {
    if (hunk.oldCount === 0) {
      // Pure addition after line `oldStart`.
      if (hunk.oldStart < range.startLine) {
        shift += hunk.newCount
      } else if (hunk.oldStart < range.endLine) {
        return null
      }
      continue
    }
    const oldEnd = hunk.oldStart + hunk.oldCount - 1
    if (oldEnd < range.startLine) {
      shift += hunk.newCount - hunk.oldCount
    } else if (hunk.oldStart <= range.endLine) {
      return null
    }
  }
  return { startLine: range.startLine + shift, endLine: range.endLine + shift }
}
