// Local build: messages a terminal-backed chat holds in Orca while its agent works, so they can be
// edited, deleted, reordered or sent now (Paweł: the terminal chat gets the structured chat's queue).
// Typed into the agent's terminal they would sit in the CLI's own queue, out of Orca's reach.
// Module state keyed by pane, so a remounted chat (tab switch, split move) keeps its held messages.

import type { QueuedMessageCard } from '../../../../../shared/agent-session/view/structured-agent-session-queued-cards'
import type { QueuedMessageMoveAnchor } from './use-structured-agent-session-queued-reorder'

/** An image chip as the composer held it; the id lets Edit hand the same chip back. */
export type NativeChatTerminalHeldImage = { id?: string; path: string; connectionId?: string }

export type NativeChatTerminalHeldMessage = {
  id: string
  /** What would have been typed: agent references and pasted text already written out. */
  text: string
  images: readonly NativeChatTerminalHeldImage[]
}

/** Sends one held message into the terminal; true once it was typed. */
export type NativeChatTerminalHeldSender = (
  message: { text: string; imagePaths: string[] },
  sendNow: boolean
) => boolean

const EMPTY: readonly NativeChatTerminalHeldMessage[] = []
const held = new Map<string, readonly NativeChatTerminalHeldMessage[]>()
const listeners = new Map<string, Set<() => void>>()
const senders = new Map<string, NativeChatTerminalHeldSender>()
let nextId = 0

function write(paneKey: string, messages: readonly NativeChatTerminalHeldMessage[]): void {
  if (messages.length === 0) {
    held.delete(paneKey)
  } else {
    held.set(paneKey, messages)
  }
  listeners.get(paneKey)?.forEach((listener) => listener())
}

export function readNativeChatTerminalHeldMessages(
  paneKey: string
): readonly NativeChatTerminalHeldMessage[] {
  return held.get(paneKey) ?? EMPTY
}

export function subscribeToNativeChatTerminalHeldMessages(
  paneKey: string,
  listener: () => void
): () => void {
  const set = listeners.get(paneKey) ?? new Set()
  set.add(listener)
  listeners.set(paneKey, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) {
      listeners.delete(paneKey)
    }
  }
}

export function holdNativeChatTerminalMessage(
  paneKey: string,
  message: Omit<NativeChatTerminalHeldMessage, 'id'>
): string {
  nextId += 1
  const id = `terminal-held-${Date.now().toString(36)}-${nextId}`
  write(paneKey, [...readNativeChatTerminalHeldMessages(paneKey), { ...message, id }])
  return id
}

/** Removes and returns one held message; null when it is already gone. */
export function takeNativeChatTerminalHeldMessage(
  paneKey: string,
  id: string
): NativeChatTerminalHeldMessage | null {
  const messages = readNativeChatTerminalHeldMessages(paneKey)
  const taken = messages.find((message) => message.id === id) ?? null
  if (taken) {
    write(
      paneKey,
      messages.filter((message) => message !== taken)
    )
  }
  return taken
}

export function clearNativeChatTerminalHeldMessages(paneKey: string): void {
  write(paneKey, EMPTY)
}

export function moveNativeChatTerminalHeldMessage(
  paneKey: string,
  id: string,
  anchor: QueuedMessageMoveAnchor
): void {
  const messages = readNativeChatTerminalHeldMessages(paneKey)
  const moving = messages.find((message) => message.id === id)
  if (!moving) {
    return
  }
  const rest = messages.filter((message) => message !== moving)
  const anchorId = anchor.afterMessageId ?? anchor.beforeMessageId
  const at = anchorId == null ? rest.length : rest.findIndex((message) => message.id === anchorId)
  // An anchor that left meanwhile keeps the order as it was.
  if (at < 0) {
    return
  }
  const index = at + (anchor.afterMessageId ? 1 : 0)
  write(paneKey, [...rest.slice(0, index), moving, ...rest.slice(index)])
}

/** The composer that types this pane's held messages; the last one mounted wins. */
export function registerNativeChatTerminalHeldSender(
  paneKey: string,
  sender: NativeChatTerminalHeldSender
): () => void {
  senders.set(paneKey, sender)
  return () => {
    if (senders.get(paneKey) === sender) {
      senders.delete(paneKey)
    }
  }
}

export function sendNativeChatTerminalHeldMessage(
  paneKey: string,
  message: NativeChatTerminalHeldMessage,
  sendNow: boolean
): boolean {
  const sender = senders.get(paneKey)
  return sender
    ? sender({ text: message.text, imagePaths: message.images.map((image) => image.path) }, sendNow)
    : false
}

/** Held messages drawn with the structured chat's queued cards: plainly waiting their turn. */
export function nativeChatTerminalHeldCards(
  messages: readonly NativeChatTerminalHeldMessage[]
): QueuedMessageCard[] {
  return messages.map((message, position) => ({
    messageId: message.id,
    position,
    text: message.text,
    ...(message.images.length > 0
      ? {
          images: message.images.map((image) => ({ type: 'image-ref' as const, path: image.path }))
        }
      : {}),
    state: 'waiting',
    hold: 'turn'
  }))
}

export function resetNativeChatTerminalHeldMessagesForTests(): void {
  held.clear()
  listeners.clear()
  senders.clear()
}
