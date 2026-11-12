import { stripScrollbackAnsi } from './session/terminal/assembly/native-chat-scrape-fallback'

// Why: xterm's serializer writes a run of empty cells as a cursor move, not as spaces; stripping it
// as an escape would glue the words on either side together.
const CURSOR_FORWARD = new RegExp(`${String.fromCharCode(27)}\\[(\\d*)C`, 'g')
const RULE_CHARS = /[─━═╌╍┄┅┈┉╭╮╰╯]/g
// Claude's mode line under its input box ("⏵⏵ bypass permissions on (shift+tab to cycle)").
const FOOTER = /shift\+tab to cycle|\? for shortcuts/

function isRule(line: string): boolean {
  const trimmed = line.trim()
  return (
    trimmed.length > 0 &&
    (trimmed.match(RULE_CHARS)?.length ?? 0) >= 8 &&
    trimmed.replace(RULE_CHARS, '').trim().length === 0
  )
}

function isContent(line: string): boolean {
  return line.trim().length > 0 && !isRule(line) && !FOOTER.test(line)
}

function dedent(lines: string[]): string[] {
  const indent = Math.min(...lines.map((line) => line.length - line.trimStart().length))
  return lines.map((line) => line.slice(indent))
}

/**
 * What the agent's terminal shows at its bottom, for a wait the chat cannot draw as a card (an
 * MCP form, a subagent's question, a permission prompt it cannot read). A TUI draws such a prompt
 * in place of its input box, under a rule line, so the excerpt starts after the last rule with
 * something other than the mode line below it; without one it is the screen's last lines.
 */
export function terminalPromptExcerpt(screen: string | null | undefined, maxLines = 16): string[] {
  if (!screen) {
    return []
  }
  const text = stripScrollbackAnsi(
    screen.replace(CURSOR_FORWARD, (_match, count: string) => ' '.repeat(Number(count) || 1))
  )
  const lines = text.split('\n').map((line) => line.trimEnd())
  let start = 0
  for (let index = lines.length - 1; index >= 0; index--) {
    if (isRule(lines[index]) && lines.slice(index + 1).some(isContent)) {
      start = index + 1
      break
    }
  }
  const body = lines
    .slice(start)
    .filter((line) => line.trim().length > 0 && !isRule(line) && !FOOTER.test(line))
  return body.length === 0 ? [] : dedent(body.slice(-maxLines))
}
