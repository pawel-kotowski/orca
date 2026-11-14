import { formatFileLinkLocation } from '../file-links/file-link-location'

// Why: chat links and visuals name code as `path:40-62`; the shared file-link parser knows only `path:40`.

const RANGE_SUFFIX_PATTERN = /^(.+):([1-9]\d{0,6})-([1-9]\d{0,6})$/
const MAX_VISUAL_PATH_LENGTH = 1024
const MAX_VISUAL_RANGE_LINES = 5000

export type CodeLineRange = { pathText: string; startLine: number; endLine: number }

/** `path:40-62` → the path and both lines; null when the text carries no range. */
export function splitLineRangeSuffix(text: string): CodeLineRange | null {
  const match = RANGE_SUFFIX_PATTERN.exec(text)
  if (!match) {
    return null
  }
  const startLine = Number(match[2])
  const endLine = Number(match[3])
  return endLine >= startLine ? { pathText: match[1]!, startLine, endLine } : null
}

/** Inverse of the chat route: `path`, `path:line`, `path:line:column` or `path:start-end`. */
export function formatNativeChatFileLocation(location: {
  pathText: string
  line: number | null
  column?: number | null
  endLine?: number
}): string {
  const base = formatFileLinkLocation(location)
  return location.endLine !== undefined && location.line !== null && location.column == null
    ? `${base}-${location.endLine}`
    : base
}

/** A detected `path:40` link directly followed by `-62` grows to cover the range. */
export function extendLinkWithLineRange<
  T extends {
    line: number | null
    column: number | null
    endIndex: number
    displayText: string
  }
>(value: string, link: T): T & { endLine?: number } {
  if (link.line === null || link.column !== null) {
    return link
  }
  const suffix = /^-([1-9]\d{0,6})(?![\w-]|\.\d)/.exec(value.slice(link.endIndex))
  const endLine = suffix ? Number(suffix[1]) : 0
  if (!suffix || endLine < link.line) {
    return link
  }
  return {
    ...link,
    endIndex: link.endIndex + suffix[0].length,
    displayText: link.displayText + suffix[0],
    endLine
  }
}

/** A visual's `data-orca-show="path:40-62"`: a worktree-relative path and a sane range, else null. */
export function parseVisualCodeLocation(value: unknown): CodeLineRange | null {
  if (typeof value !== 'string' || value.length > MAX_VISUAL_PATH_LENGTH + 16) {
    return null
  }
  const text = value.trim()
  const single = /^(.+):([1-9]\d{0,6})$/.exec(text)
  const range =
    splitLineRangeSuffix(text) ??
    (single
      ? { pathText: single[1]!, startLine: Number(single[2]), endLine: Number(single[2]) }
      : null)
  if (!range || range.endLine - range.startLine >= MAX_VISUAL_RANGE_LINES) {
    return null
  }
  const path = range.pathText
  const segments = path.split(/[\\/]/)
  const outsideWorktree =
    /^[\\/~]/.test(path) || segments.some((segment) => segment === '..' || segment === '')
  // A colon would be a drive letter or a scheme; control characters are never a file name here.
  // oxlint-disable-next-line no-control-regex -- rejecting control characters is the point.
  if (outsideWorktree || /[:\u0000-\u001f]/.test(path)) {
    return null
  }
  return range
}
