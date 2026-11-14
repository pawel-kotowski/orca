import { isWindowsAbsolutePathLike } from '../cross-platform-path'
import { fileUriToFilesystemPath } from '../file-links/file-uri-path'
import { splitLineRangeSuffix } from './native-chat-code-range'

export type NativeChatHrefRoute =
  | { kind: 'web'; url: string }
  | {
      kind: 'file'
      pathText: string
      line: number | null
      /** Set for `path:40-62` and `#L40-L62`: the link names lines `line`…`endLine`. */
      endLine?: number
      pathKind?: 'literal'
    }
  | { kind: 'none' }

const WEB_SCHEME_PATTERN = /^(?:https?|mailto):/i
const SCHEME_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:/
// Why: `README.md:5` is a file location; the scheme pattern alone reads `README.md:` as a scheme.
const BARE_FILE_LOCATION_PATTERN = /^[^\s:/\\?#]+\.[\p{L}\p{N}_+-]+:\d+(?::\d+|-\d+)?$/u
export const NATIVE_CHAT_FILE_HREF_PREFIX = '#orca-native-chat-file='
const NATIVE_CHAT_LITERAL_FILE_HREF_PREFIX = '#orca-native-chat-file-path='
const MAX_NATIVE_CHAT_FILE_HREF_DECODES = 4

/** Location text keeps reply parsing; known tool paths retain every filename character. */
export function createNativeChatFileHref(
  pathText: string,
  pathKind: 'location' | 'literal' = 'location'
): string {
  const prefix =
    pathKind === 'literal' ? NATIVE_CHAT_LITERAL_FILE_HREF_PREFIX : NATIVE_CHAT_FILE_HREF_PREFIX
  return `${prefix}${encodeURIComponent(pathText)}`
}

function decodeNativeChatFileHref(
  href: string,
  prefix = NATIVE_CHAT_FILE_HREF_PREFIX
): string | null {
  if (!href.startsWith(prefix)) {
    return null
  }
  try {
    const decoded = decodeURIComponent(href.slice(prefix.length))
    if (prefix === NATIVE_CHAT_LITERAL_FILE_HREF_PREFIX) {
      return decoded || null
    }
    return decoded && !decoded.startsWith(NATIVE_CHAT_FILE_HREF_PREFIX) ? decoded : null
  } catch {
    return null
  }
}

type LineFragment = { line: number | null; endLine?: number }

function parseLineFragment(hash: string): LineFragment {
  if (!hash) {
    return { line: null }
  }
  let decoded = hash
  try {
    decoded = decodeURIComponent(hash)
  } catch {}
  const match = /^(?:L|line-?)([1-9]\d*)(?:-L?([1-9]\d*))?\b/i.exec(decoded)
  if (!match) {
    return { line: null }
  }
  const line = Number.parseInt(match[1]!, 10)
  const endLine = match[2] ? Number.parseInt(match[2], 10) : undefined
  return endLine !== undefined && endLine > line ? { line, endLine } : { line }
}

/** `path:40-62` becomes the path at line 40 through 62; anything else is left to the location parser. */
function fileRoute(pathText: string, fragment: LineFragment): NativeChatHrefRoute {
  const range = splitLineRangeSuffix(pathText)
  if (range && range.endLine > range.startLine) {
    return { kind: 'file', pathText: range.pathText, line: range.startLine, endLine: range.endLine }
  }
  if (range) {
    return { kind: 'file', pathText: range.pathText, line: range.startLine }
  }
  return { kind: 'file', pathText, ...fragment }
}

function stripQueryAndHash(value: string): { pathText: string; fragment: LineFragment } {
  const hashIndex = value.indexOf('#')
  const queryIndex = value.indexOf('?')
  const suffixIndex =
    hashIndex === -1 ? queryIndex : queryIndex === -1 ? hashIndex : Math.min(hashIndex, queryIndex)
  const pathText = suffixIndex === -1 ? value : value.slice(0, suffixIndex)
  const hash =
    hashIndex === -1
      ? ''
      : value.slice(hashIndex + 1, queryIndex > hashIndex ? queryIndex : undefined)
  return { pathText, fragment: parseLineFragment(hash) }
}

function maybeDecodeHrefPath(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function routeNativeChatHref(href: string | null | undefined): NativeChatHrefRoute {
  let trimmed = href?.trim()
  if (!trimmed) {
    return { kind: 'none' }
  }
  if (trimmed.startsWith(NATIVE_CHAT_LITERAL_FILE_HREF_PREFIX)) {
    const pathText = decodeNativeChatFileHref(trimmed, NATIVE_CHAT_LITERAL_FILE_HREF_PREFIX)
    return pathText ? { kind: 'file', pathText, line: null, pathKind: 'literal' } : { kind: 'none' }
  }
  let isLiteralFileLocation = false
  for (let depth = 0; depth < MAX_NATIVE_CHAT_FILE_HREF_DECODES; depth += 1) {
    const encodedFileHref = decodeNativeChatFileHref(trimmed)
    if (!encodedFileHref) {
      break
    }
    trimmed = encodedFileHref.trim()
    isLiteralFileLocation = true
  }
  if (!trimmed || trimmed.startsWith(NATIVE_CHAT_FILE_HREF_PREFIX)) {
    return { kind: 'none' }
  }
  if (isLiteralFileLocation) {
    // Why: `#`, `?` and `%XX` are legal filename characters, not URL syntax, in wrapped text.
    return fileRoute(trimmed, { line: null })
  }
  if (trimmed.startsWith('#')) {
    return { kind: 'none' }
  }
  if (WEB_SCHEME_PATTERN.test(trimmed)) {
    return { kind: 'web', url: trimmed }
  }
  if (/^file:/i.test(trimmed)) {
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      return { kind: 'none' }
    }
    const pathText = fileUriToFilesystemPath(url)
    if (!pathText) {
      return { kind: 'none' }
    }
    return { kind: 'file', pathText, ...parseLineFragment(url.hash.slice(1)) }
  }
  if (
    !isWindowsAbsolutePathLike(trimmed) &&
    !BARE_FILE_LOCATION_PATTERN.test(trimmed) &&
    SCHEME_PATTERN.test(trimmed)
  ) {
    return { kind: 'none' }
  }
  const { pathText, fragment } = stripQueryAndHash(trimmed)
  const decodedPathText = maybeDecodeHrefPath(pathText)
  return decodedPathText ? fileRoute(decodedPathText, fragment) : { kind: 'none' }
}
