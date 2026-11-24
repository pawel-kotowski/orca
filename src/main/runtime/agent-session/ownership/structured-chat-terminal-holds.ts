import { readFileSync, renameSync } from 'node:fs'
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
  ptyId: string | null
  /** Its exact process: a degraded daemon's stand-in shell takes the same pty id. */
  incarnationId: string | null
  paneKey: string | null
  /** The conversation's agent was seen in that terminal, so a bare shell there means it ended. */
  ran: boolean
}

/** A terminal's spawn carries its handover's token here; the host strips it before the spawn. */
export { CHAT_HANDOVER_ENV } from '../../../../shared/agent-session/lifecycle/operations/agent-session-terminal-handover'

/** What is known of the hold's terminal now; `unknown` is never `absent`. */
export type TerminalHoldPane = 'unknown' | 'absent' | 'running' | 'shell'

const FILE = 'structured-chat-terminal-holds.json'
const UNREADABLE_FILE = 'structured-chat-terminal-holds.unreadable.json'
let holds: Map<string, StructuredChatTerminalHold> | null = null
let unreadable = false
// Handovers given up before their `begin` made a hold.
const abandoned = new Set<string>()
// Handovers whose terminal is being spawned by this process: not listed yet is not gone.
const spawning = new Set<string>()
const listeners = new Set<(sessionId: string) => void>()

function storagePath(file: string): string | null {
  try {
    return join(getAppEnvironment().getPath('userData'), file)
  } catch {
    return null
  }
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
    (hold.ptyId === null || typeof hold.ptyId === 'string') &&
    (hold.incarnationId === null || typeof hold.incarnationId === 'string') &&
    (hold.paneKey === null || typeof hold.paneKey === 'string') &&
    typeof hold.ran === 'boolean'
    ? {
        token: hold.token,
        id: hold.id,
        agent: hold.agent,
        conversationId: hold.conversationId,
        phase: hold.phase,
        ptyId: hold.ptyId,
        incarnationId: hold.incarnationId,
        paneKey: hold.paneKey,
        ran: hold.ran
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

function loaded(): Map<string, StructuredChatTerminalHold> {
  if (holds) {
    return holds
  }
  const path = storagePath(FILE)
  if (path === null) {
    // No profile yet (a test, an early call): nothing to remember it under.
    return new Map()
  }
  try {
    holds = readSaved(path)
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
function commit(sessionId: string, hold: StructuredChatTerminalHold | null): void {
  const next = new Map(loaded())
  if (hold) {
    next.set(sessionId, hold)
  } else {
    next.delete(sessionId)
  }
  save(next)
  holds = next
}

/** For what was learnt of a hold: true either way, and learnt again after a restart. */
function learn(sessionId: string, facts: Partial<StructuredChatTerminalHold>): void {
  const hold = loaded().get(sessionId)
  if (!hold) {
    return
  }
  const next = { ...hold, ...facts }
  try {
    commit(sessionId, next)
  } catch (error) {
    loaded().set(sessionId, next)
    console.warn('[chat-terminal] could not save a handed-over chat', error)
  }
}

/** Told of every hold that ends, so what waited for the chat can go on. */
export function onStructuredChatTerminalHoldEnded(
  listener: (sessionId: string) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function structuredChatTerminalHold(sessionId: string): StructuredChatTerminalHold | null {
  return loaded().get(sessionId) ?? null
}

export function heldStructuredChats(): readonly string[] {
  return [...loaded().keys()]
}

/** A saved hold could not be read: a chat that looks free may be a terminal's. */
export function structuredChatTerminalHoldsUnreadable(): boolean {
  loaded()
  return unreadable
}

/** A terminal restore never resumes a handed-over conversation by itself. */
export function conversationHeldForTerminal(conversationId: string): boolean {
  return [...loaded().values()].some((hold) => hold.conversationId === conversationId)
}

/** False when the client gave it up meanwhile. Throws, holding nothing, when it cannot be saved. */
export function beginStructuredChatTerminalHold(
  sessionId: string,
  handover: Pick<StructuredChatTerminalHold, 'token' | 'id' | 'agent' | 'conversationId'>
): boolean {
  if (abandoned.has(handover.token)) {
    return false
  }
  commit(sessionId, {
    ...handover,
    phase: 'opening',
    ptyId: null,
    incarnationId: null,
    paneKey: null,
    ran: false
  })
  return true
}

export function releaseStructuredChatTerminalHold(sessionId: string, token: string): boolean {
  if (loaded().get(sessionId)?.token !== token) {
    return false
  }
  try {
    commit(sessionId, null)
  } catch (error) {
    // Its terminal is done whatever the disk says; a restart finds that out again.
    loaded().delete(sessionId)
    console.warn('[chat-terminal] could not save the returned chat', error)
  }
  for (const listener of listeners) {
    listener(sessionId)
  }
  return true
}

/** The client will launch nothing (more): releases the hold unless its terminal was asked for. */
export function abandonStructuredChatTerminalHold(sessionId: string, token: string): void {
  const hold = loaded().get(sessionId)
  if (hold?.token === token) {
    if (hold.phase === 'opening') {
      releaseStructuredChatTerminalHold(sessionId, token)
    }
    return
  }
  abandoned.add(token)
}

/** Its `begin` is over, so nothing can be made under the token any more. */
export function forgetAbandonedStructuredChatTerminalHold(token: string): void {
  abandoned.delete(token)
}

function holdOfToken(token: string): [string, StructuredChatTerminalHold] | undefined {
  return [...loaded()].find(([, hold]) => hold.token === token)
}

/**
 * A handover's terminal is about to be spawned: only under its own hold, which from here ends only
 * by proof. A handover that ended first has its chat back, so the spawn must not go on.
 */
export function admitStructuredChatTerminalSpawn(
  token: string,
  terminal: { ptyId: string | null; paneKey: string | null }
): void {
  const found = holdOfToken(token)
  if (!found) {
    throw new Error('This conversation went back to its chat before the terminal opened.')
  }
  const [sessionId, hold] = found
  commit(sessionId, { ...hold, ...terminal, phase: 'terminal', ran: false })
  spawning.add(token)
}

export function structuredChatTerminalSpawning(token: string): boolean {
  return spawning.has(token)
}

/** The spawn answered, either way: from here its terminal is found where the host lists it. */
export function settleStructuredChatTerminalSpawn(token: string): void {
  spawning.delete(token)
}

export function bindStructuredChatTerminal(
  token: string,
  terminal: { ptyId: string; incarnationId: string | null; paneKey: string | null }
): void {
  const found = holdOfToken(token)
  if (found) {
    learn(found[0], terminal)
  }
}

/** The spawn failed. Before it was admitted there is no terminal; after, the host looks for one. */
export function failStructuredChatTerminalSpawn(token: string): void {
  const found = holdOfToken(token)
  if (found) {
    abandonStructuredChatTerminalHold(found[0], token)
  }
}

/** An agent process in a terminal named its conversation: it runs there. */
export function noteStructuredChatTerminalReport(
  ptyId: string,
  conversationId: string | undefined
): void {
  for (const [sessionId, hold] of loaded()) {
    if (!hold.ran && hold.ptyId === ptyId && hold.conversationId === conversationId) {
      learn(sessionId, { ran: true })
    }
  }
}

export function noteStructuredChatTerminalRan(sessionId: string): void {
  if (loaded().get(sessionId)?.ran === false) {
    learn(sessionId, { ran: true })
  }
}

/** Whether a hold's terminal may still write. Ends only by proof: the terminal is gone, or its shell
 *  is alone after the conversation's agent ran in it. `rowsMayWrite`: another terminal may have it. */
export function structuredChatTerminalMayWrite(
  hold: StructuredChatTerminalHold,
  now: { pane: TerminalHoldPane; rowsMayWrite: boolean }
): boolean {
  if (hold.phase === 'opening' || now.rowsMayWrite) {
    return true
  }
  switch (now.pane) {
    case 'unknown':
    case 'running':
      return true
    case 'absent':
      return false
    case 'shell':
      // Alone before the agent ran in it, it is only about to be given the command. A finished-command
      // mark proves nothing here: a shell's first prompt can send one.
      return !hold.ran
  }
}

/** After a restart nothing can spawn for a handover that had not reached its terminal. */
export function releaseUnlaunchedStructuredChatTerminalHolds(): void {
  for (const [sessionId, hold] of loaded()) {
    if (hold.phase === 'opening') {
      releaseStructuredChatTerminalHold(sessionId, hold.token)
    }
  }
}

export function resetStructuredChatTerminalHoldsForTests(): void {
  holds = null
  unreadable = false
  abandoned.clear()
  spawning.clear()
  listeners.clear()
}
