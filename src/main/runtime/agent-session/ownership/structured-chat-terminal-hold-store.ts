import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomically } from '../../../filesystem/atomic-file-publication'
import type { StructuredAgentId } from '../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { getAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'

/**
 * Chats handed to a terminal (local build). From the press on, the terminal's agent may write the
 * conversation, so nothing else may start on it until that terminal is proven done. Saved, since a
 * terminal outlives an Orca restart.
 */
export type StructuredChatTerminalHold = {
  /** The client's own mark for this handover; its terminal's spawn must carry it. */
  token: string
  /** Names this handover to clients, which never see the token of another's. */
  id: string
  agent: StructuredAgentId
  conversationId: string
  /** `opening`: no terminal was asked for yet, and none can be without this hold. */
  phase: 'opening' | 'terminal'
  /** Every terminal the conversation was started in: an account switch restarts it in another. */
  terminals: StructuredChatHoldTerminal[]
  /** The cards of messages that came meanwhile, oldest first. */
  waiting: string[]
}

export type StructuredChatHoldTerminal = {
  ptyId: string | null
  /** Its exact process: a degraded daemon's stand-in shell takes the same pty id. */
  incarnationId: string | null
  paneKey: string | null
  /** The conversation's agent was seen in that terminal, so a bare shell there means it ended. */
  ran: boolean
}

const FILE = 'structured-chat-terminal-holds.json'
const UNREADABLE_FILE = 'structured-chat-terminal-holds.unreadable.json'
let holds: Map<string, StructuredChatTerminalHold> | null = null
let unreadable = false
// Holds an earlier Orca left, which a client of this one cannot be launching.
const inherited = new Set<string>()

function storagePath(file: string): string | null {
  try {
    return join(getAppEnvironment().getPath('userData'), file)
  } catch {
    return null
  }
}

function isTerminal(value: unknown): value is StructuredChatHoldTerminal {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every field is checked below.
  const terminal = value as Partial<StructuredChatHoldTerminal> | null
  return (
    typeof terminal === 'object' &&
    terminal !== null &&
    (terminal.ptyId === null || typeof terminal.ptyId === 'string') &&
    (terminal.incarnationId === null || typeof terminal.incarnationId === 'string') &&
    (terminal.paneKey === null || typeof terminal.paneKey === 'string') &&
    typeof terminal.ran === 'boolean'
  )
}

function parsedHold(value: unknown): StructuredChatTerminalHold | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: every field is checked below.
  const hold = value as Partial<StructuredChatTerminalHold>
  return typeof hold.token === 'string' &&
    typeof hold.id === 'string' &&
    typeof hold.agent === 'string' &&
    typeof hold.conversationId === 'string' &&
    (hold.phase === 'opening' || hold.phase === 'terminal') &&
    Array.isArray(hold.terminals) &&
    hold.terminals.every(isTerminal) &&
    Array.isArray(hold.waiting) &&
    hold.waiting.every((id) => typeof id === 'string')
    ? {
        token: hold.token,
        id: hold.id,
        agent: hold.agent,
        conversationId: hold.conversationId,
        phase: hold.phase,
        terminals: hold.terminals,
        waiting: hold.waiting
      }
    : null
}

function readSaved(path: string): Map<string, StructuredChatTerminalHold> {
  const saved: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
    throw new Error('not a list of holds')
  }
  return new Map(
    Object.entries(saved).map(([sessionId, value]) => {
      const hold = parsedHold(value)
      if (!hold) {
        throw new Error(`unreadable hold of ${sessionId}`)
      }
      return [sessionId, hold] as const
    })
  )
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export function loadedHolds(): Map<string, StructuredChatTerminalHold> {
  if (holds) {
    return holds
  }
  const path = storagePath(FILE)
  if (path === null) {
    // No profile yet (a test, an early call): nothing to remember it under.
    return new Map()
  }
  unreadable = existsSync(storagePath(UNREADABLE_FILE) ?? path)
  try {
    holds = readSaved(path)
    for (const { token } of holds.values()) {
      inherited.add(token)
    }
  } catch (error) {
    holds = new Map()
    if (!isMissing(error)) {
      // Which chats were handed over is unknown, not "none": set the file aside and say so.
      unreadable = true
      console.warn('[chat-terminal] could not read the handed-over chats', error)
      try {
        renameSync(path, storagePath(UNREADABLE_FILE) ?? path)
      } catch {
        // It stays where it is and is read again at the next start.
      }
    }
  }
  return holds
}

function save(next: Map<string, StructuredChatTerminalHold>): void {
  const path = storagePath(FILE)
  if (path === null) {
    throw new Error('chat_terminal_holds_unavailable')
  }
  writeFileAtomically(path, JSON.stringify(Object.fromEntries(next)))
}

/** For a change that must not be lost: nothing changes when it cannot be saved. */
export function commitHold(sessionId: string, hold: StructuredChatTerminalHold | null): void {
  const next = new Map(loadedHolds())
  if (hold) {
    next.set(sessionId, hold)
  } else {
    next.delete(sessionId)
  }
  save(next)
  holds = next
}

/** For what was learnt of a hold: true either way, and learnt again after a restart. */
export function learnHold(sessionId: string, facts: Partial<StructuredChatTerminalHold>): void {
  const hold = loadedHolds().get(sessionId)
  if (!hold) {
    return
  }
  const next = { ...hold, ...facts }
  try {
    commitHold(sessionId, next)
  } catch (error) {
    loadedHolds().set(sessionId, next)
    console.warn('[chat-terminal] could not save a handed-over chat', error)
  }
}

/** A saved hold could not be read: a chat that looks free may be a terminal's. */
export function structuredChatTerminalHoldsUnreadable(): boolean {
  loadedHolds()
  return unreadable
}

/** Every terminal was looked at and none runs an agent, so none of the lost holds is needed. */
export function forgetUnreadableStructuredChatTerminalHolds(): void {
  const path = storagePath(UNREADABLE_FILE)
  if (path) {
    rmSync(path, { force: true })
  }
  unreadable = false
}

/** Left by an earlier Orca, and held still. */
export function holdIsInherited(token: string): boolean {
  return inherited.has(token)
}

export function endInheritedHold(token: string): boolean {
  return inherited.delete(token)
}

export function dropHold(sessionId: string): void {
  try {
    commitHold(sessionId, null)
  } catch (error) {
    // Its terminal is done whatever the disk says; a restart finds that out again.
    loadedHolds().delete(sessionId)
    console.warn('[chat-terminal] could not save the returned chat', error)
  }
}

export function resetHoldStoreForTests(): void {
  holds = null
  unreadable = false
  inherited.clear()
}
