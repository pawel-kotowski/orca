import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'

/**
 * Chats handed to a terminal (local build). The terminal's agent is a second writer from the press
 * on, long before its first hook and, for agents that report no process, after it too; so the chat
 * is held until that terminal is proven done. Saved, since a terminal outlives an Orca restart.
 */
export type StructuredChatTerminalHold = {
  /** The client's own mark for this handover; only its failed launch may abandon it. */
  token: string
  conversationId: string
  /** The pane the agent was launched in, as this host names it; null until it is known. */
  paneKey: string | null
  /** A hook from a terminal agent named the conversation. */
  reported: boolean
}

/** What the host knows of the hold's pane now. */
export type TerminalHoldPane = 'missing' | 'dead' | 'running' | 'shell'

const FILE = 'structured-chat-terminal-holds.json'
let holds: Map<string, StructuredChatTerminalHold> | null = null
// In memory only: after a restart a pane not yet reattached is unknown, never gone.
const seenAlive = new Set<string>()

function filePath(): string | null {
  try {
    return join(getAppEnvironment().getPath('userData'), FILE)
  } catch {
    return null
  }
}

function isHold(value: unknown): value is StructuredChatTerminalHold {
  const hold = value as Partial<StructuredChatTerminalHold> | null
  return (
    typeof hold === 'object' &&
    hold !== null &&
    typeof hold.token === 'string' &&
    typeof hold.conversationId === 'string' &&
    (hold.paneKey === null || typeof hold.paneKey === 'string') &&
    typeof hold.reported === 'boolean'
  )
}

function loaded(): Map<string, StructuredChatTerminalHold> {
  if (holds) {
    return holds
  }
  holds = new Map()
  const path = filePath()
  try {
    const saved: unknown = path ? JSON.parse(readFileSync(path, 'utf8')) : {}
    for (const [sessionId, hold] of Object.entries(saved as Record<string, unknown>)) {
      if (isHold(hold)) {
        holds.set(sessionId, hold)
      }
    }
  } catch {
    // Absent or unreadable: nothing is held.
  }
  return holds
}

function save(): void {
  const path = filePath()
  if (path) {
    try {
      writeFileSync(path, JSON.stringify(Object.fromEntries(loaded())))
    } catch (error) {
      console.warn('[chat-terminal] could not save the handed-over chats', error)
    }
  }
}

export function structuredChatTerminalHold(sessionId: string): StructuredChatTerminalHold | null {
  return loaded().get(sessionId) ?? null
}

export function heldStructuredChats(): readonly string[] {
  return [...loaded().keys()]
}

export function beginStructuredChatTerminalHold(
  sessionId: string,
  token: string,
  conversationId: string
): void {
  seenAlive.delete(sessionId)
  loaded().set(sessionId, { token, conversationId, paneKey: null, reported: false })
  save()
}

export function bindStructuredChatTerminalHold(
  sessionId: string,
  token: string,
  paneKey: string
): void {
  const hold = loaded().get(sessionId)
  if (hold?.token === token) {
    hold.paneKey = paneKey
    save()
  }
}

/** A hook named a conversation: the terminal that has it is no longer only starting. */
export function noteStructuredChatTerminalReport(conversationId: string | undefined): void {
  for (const hold of loaded().values()) {
    if (conversationId !== undefined && hold.conversationId === conversationId && !hold.reported) {
      hold.reported = true
      save()
    }
  }
}

/** With a token, only that handover's own hold. */
export function releaseStructuredChatTerminalHold(sessionId: string, token?: string): boolean {
  const hold = loaded().get(sessionId)
  if (!hold || (token !== undefined && hold.token !== token)) {
    return false
  }
  loaded().delete(sessionId)
  seenAlive.delete(sessionId)
  save()
  return true
}

/**
 * Whether the hold's terminal may still write the conversation. `rowsMayWrite`: a terminal row
 * names the conversation and its agent is live or cannot be judged.
 */
export function structuredChatTerminalMayWrite(
  sessionId: string,
  pane: TerminalHoldPane,
  rowsMayWrite: boolean
): boolean {
  const hold = loaded().get(sessionId)
  if (!hold) {
    return rowsMayWrite
  }
  if (pane === 'running' || pane === 'shell') {
    seenAlive.add(sessionId)
  }
  const gone = (pane === 'missing' || pane === 'dead') && seenAlive.has(sessionId)
  if (gone) {
    return rowsMayWrite
  }
  // Not reported yet, or its pane not seen since a restart: the agent may be about to write.
  return rowsMayWrite || !hold.reported || pane === 'missing' || pane === 'dead'
}

export function resetStructuredChatTerminalHoldsForTests(): void {
  holds = new Map()
  seenAlive.clear()
}
