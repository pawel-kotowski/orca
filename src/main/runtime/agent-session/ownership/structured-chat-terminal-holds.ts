/**
 * Chats handed to a terminal (local build). The terminal's agent is a second writer from the moment
 * it is launched, but the host sees it only at its first hook, so the chat is held from the press.
 */
type TerminalHold = { begunAt: number; paneKey: string | null }

const holds = new Map<string, TerminalHold>()

export function beginStructuredChatTerminalHold(sessionId: string, now: number): void {
  holds.set(sessionId, { begunAt: now, paneKey: null })
}

export function bindStructuredChatTerminalHold(sessionId: string, paneKey: string): void {
  const hold = holds.get(sessionId)
  if (hold) {
    hold.paneKey = paneKey
  }
}

export function endStructuredChatTerminalHold(sessionId: string): void {
  holds.delete(sessionId)
}

/** Whether the hold still keeps the chat from starting; one that has done its work is dropped. */
export function structuredChatTerminalHeld(
  sessionId: string,
  terminal: {
    /** Newest report of a terminal writer of this conversation, on the host's clock. */
    reportedAt: number | null
    paneAlive: (paneKey: string) => boolean
  }
): boolean {
  const hold = holds.get(sessionId)
  if (!hold) {
    return false
  }
  // Once its agent reported, the writer check decides; a pane that is gone never will.
  const reported = terminal.reportedAt !== null && terminal.reportedAt >= hold.begunAt
  if (reported || (hold.paneKey !== null && !terminal.paneAlive(hold.paneKey))) {
    holds.delete(sessionId)
    return false
  }
  return true
}
