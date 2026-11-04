// Shell words that continue the statement before them, so a break before them reads badly.
const KEEP_ON_LINE_AFTER_SEMICOLON = /^(?:then|do|done|fi|else|elif|esac|in)\b/

/** Lines longer than this are broken at their top-level `;`, `&&` and `||`. */
export const NATIVE_CHAT_SHELL_LINE_BREAK_AT = 80

/**
 * Break a long one-line shell command after each top-level `;`, `&&` and `||`. A newline after
 * any of them continues the same command, so the text still runs as written; quotes, `$(…)`,
 * `(…)`, `{…}`, escapes, `;;` and `; then`-style keywords are left alone.
 */
export function nativeChatBreakShellLine(line: string): string {
  if (line.length <= NATIVE_CHAT_SHELL_LINE_BREAK_AT) {
    return line
  }
  let out = ''
  let quote: '"' | "'" | '`' | null = null
  let depth = 0
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!
    if (quote) {
      out += char
      if (char === '\\' && quote !== "'" && index + 1 < line.length) {
        out += line[++index]
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '\\' && index + 1 < line.length) {
      out += char + line[++index]
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      out += char
      continue
    }
    // `[[ a && b ]]` is a test, not two commands: count it as nesting like `(…)` and `{…}`.
    if (line.startsWith('[[', index) || line.startsWith(']]', index)) {
      depth = line[index] === '[' ? depth + 1 : Math.max(0, depth - 1)
      out += line.slice(index, index + 2)
      index++
      continue
    }
    if (char === '(' || char === '{') {
      depth++
    } else if ((char === ')' || char === '}') && depth > 0) {
      depth--
    }
    if (depth === 0) {
      const pair = line.slice(index, index + 2)
      const isAndOr = pair === '&&' || pair === '||'
      const isSemicolon = char === ';' && pair !== ';;' && line[index - 1] !== ';'
      if (isAndOr || isSemicolon) {
        const separator = isAndOr ? pair : ';'
        const rest = line.slice(index + separator.length).replace(/^[ \t]+/, '')
        if (rest && !(isSemicolon && KEEP_ON_LINE_AFTER_SEMICOLON.test(rest))) {
          out += `${separator}\n`
          index += separator.length - 1
          // Skip the spaces the break replaces.
          while (line[index + 1] === ' ' || line[index + 1] === '\t') {
            index++
          }
          continue
        }
      }
    }
    out += char
  }
  return out
}
