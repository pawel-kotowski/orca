// Claude Code (2.1.31x, thinking display "updates") stores the agent's short status lines between
// tool calls as `thinking` parts the API marks as narration: the terminal shows them as the agent's
// words, so the chat must too. Real thinking is stored empty; narration carries its text, and its
// signature (base64 protobuf) names the kind.

const NARRATION_MARKER = 'narration'
// The kind sits in the signature's first fields; decode only that much.
const SIGNATURE_PREFIX_CHARS = 120

/** Whether a raw Claude content part is narration: the agent's words, though typed `thinking`. */
export function isClaudeNarrationThinking(part: Record<string, unknown> | null): boolean {
  if (part?.type !== 'thinking' || typeof part.signature !== 'string') {
    return false
  }
  const thinking = part.thinking
  if (typeof thinking !== 'string' || thinking.trim().length === 0) {
    return false
  }
  const prefix = part.signature.slice(0, SIGNATURE_PREFIX_CHARS)
  const padded = prefix.slice(0, prefix.length - (prefix.length % 4))
  try {
    return Buffer.from(padded, 'base64').toString('latin1').includes(NARRATION_MARKER)
  } catch {
    return false
  }
}
