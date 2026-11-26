import type { DiffComment } from '../../../../../shared/file-review/diff-comment-types'

function splitLines(content: string): string[] {
  return content.split(/\r\n|\r|\n/)
}

/** The text of lines `startLine`…`endLine` (1-based, inclusive), as a code note keeps it. */
export function codeNoteLinesText(content: string, startLine: number, endLine: number): string {
  return splitLines(content)
    .slice(Math.max(0, startLine - 1), Math.max(0, endLine))
    .join('\n')
}

export type CodeNoteAnchor = {
  startLine: number
  lineNumber: number
  /** The lines it was left on are nowhere in the file now. */
  stale: boolean
}

function blockStartsAt(lines: readonly string[], block: readonly string[], at: number): boolean {
  for (let offset = 0; offset < block.length; offset += 1) {
    if (lines[at + offset] !== block[offset]) {
      return false
    }
  }
  return true
}

/** Where a code note's lines are now: where it was left, else the nearest place they moved to, else stale. */
export function anchorCodeNote(
  content: string,
  note: Pick<DiffComment, 'lineNumber' | 'startLine' | 'selectedText'>
): CodeNoteAnchor {
  const startLine = note.startLine ?? note.lineNumber
  const lines = splitLines(content)
  const clampedEnd = Math.min(Math.max(1, note.lineNumber), lines.length)
  const clamped = {
    startLine: Math.min(Math.max(1, startLine), clampedEnd),
    lineNumber: clampedEnd
  }
  const text = note.selectedText
  if (text === undefined) {
    return { ...clamped, stale: false }
  }
  const block = splitLines(text)
  if (blockStartsAt(lines, block, startLine - 1)) {
    return { startLine, lineNumber: startLine + block.length - 1, stale: false }
  }
  let nearest: number | null = null
  for (let at = 0; at + block.length <= lines.length; at += 1) {
    if (
      blockStartsAt(lines, block, at) &&
      (nearest === null || Math.abs(at + 1 - startLine) < Math.abs(nearest + 1 - startLine))
    ) {
      nearest = at
    }
  }
  return nearest === null
    ? { ...clamped, stale: true }
    : { startLine: nearest + 1, lineNumber: nearest + block.length, stale: false }
}
