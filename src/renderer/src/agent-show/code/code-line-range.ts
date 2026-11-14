export type CodeLineRange = { startLine: number; endLine: number }

/** Fits a requested range into a file of `lineCount` lines; `clamped` says it had to move. */
export function clampCodeLineRange(
  range: CodeLineRange,
  lineCount: number
): { range: CodeLineRange; clamped: boolean } {
  const lastLine = Math.max(1, lineCount)
  const startLine = Math.min(Math.max(1, range.startLine), lastLine)
  const endLine = Math.min(Math.max(startLine, range.endLine), lastLine)
  return {
    range: { startLine, endLine },
    clamped: startLine !== range.startLine || endLine !== range.endLine
  }
}

export function describeClampedRange(
  requested: CodeLineRange,
  shown: CodeLineRange,
  lineCount: number
): string {
  return `lines ${requested.startLine}-${requested.endLine} are past the end of the file (${lineCount} lines); showing ${shown.startLine}-${shown.endLine}`
}
