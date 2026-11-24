/** A copy has its own conversation, though its command names the source. */
export function isConversationCopyCommand(command: string): boolean {
  return /--fork-session|\bcodex\b.*\s['"]?fork['"]?\s/.test(command)
}
