/** A copy has its own conversation, though its command names the source. */
export function isConversationCopyCommand(command: string): boolean {
  return /--fork-session|\bcodex\b.*\s['"]?fork['"]?\s/.test(command)
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whether a command line resumes the conversation: the id is the resume's own argument, not words of
 *  a prompt or a path (Claude keeps its scratch files under the conversation's id). */
export function commandResumesConversation(command: string, conversationId: string): boolean {
  const id = `['"]?${escaped(conversationId)}['"]?(?=\\s|$)`
  const flag = `(?:^|\\s)['"]?(?:--resume|-r|--session-id|--session|-s)['"]?(?:=|\\s+)${id}`
  // `codex resume`, whose options may stand before the id.
  const verb = `\\sresume['"]?(?:\\s+-\\S+(?:\\s+[^-\\s]\\S*)?)*\\s+${id}`
  const quotedVerb = verb.replace('\\sresume', `\\s['"]?resume`)
  return !isConversationCopyCommand(command) && new RegExp(`${flag}|${quotedVerb}`).test(command)
}
