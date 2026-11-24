import {
  commitHold,
  dropHold,
  endInheritedHold,
  holdIsInherited,
  learnHold,
  loadedHolds,
  resetHoldStoreForTests,
  type StructuredChatHoldTerminal,
  type StructuredChatTerminalHold
} from './structured-chat-terminal-hold-store'

export {
  forgetUnreadableStructuredChatTerminalHolds,
  structuredChatTerminalHoldsUnreadable,
  type StructuredChatHoldTerminal,
  type StructuredChatTerminalHold
} from './structured-chat-terminal-hold-store'

/** A terminal's spawn carries its handover's token here; the host strips it before the spawn. */
export { CHAT_HANDOVER_ENV } from '../../../../shared/agent-session/lifecycle/operations/agent-session-terminal-handover'

/** What is known of the hold's terminal now; `unknown` is never `absent`. */
export type TerminalHoldPane = 'unknown' | 'absent' | 'running' | 'shell'

// `begin`s under way, and those of them given up before they made a hold.
const beginning = new Set<string>()
const abandoned = new Set<string>()
// Conversations this process is starting or restarting in a terminal: not listed yet is not gone.
const starting = new Map<string, number>()
// Terminals this process asked for: where no daemon keeps them, its own list is proof.
const askedHere = new Set<string>()
const listeners = new Set<(ended: EndedStructuredChatTerminalHold) => void>()

export type EndedStructuredChatTerminalHold = {
  sessionId: string
  hold: StructuredChatTerminalHold
}

/** Told of every hold that ends, so what waited for the chat can go on. */
export function onStructuredChatTerminalHoldEnded(
  listener: (ended: EndedStructuredChatTerminalHold) => void
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function structuredChatTerminalHold(sessionId: string): StructuredChatTerminalHold | null {
  return loadedHolds().get(sessionId) ?? null
}

export function heldStructuredChats(): readonly string[] {
  return [...loadedHolds().keys()]
}

function heldConversation(
  conversationId: string | undefined
): [string, StructuredChatTerminalHold] | undefined {
  return conversationId === undefined
    ? undefined
    : [...loadedHolds()].find(([, hold]) => hold.conversationId === conversationId)
}

/** A terminal restore never resumes a handed-over conversation by itself. */
export function conversationHeldForTerminal(conversationId: string): boolean {
  return heldConversation(conversationId) !== undefined
}

/** A `begin` starts: from here an abandon of it is remembered until it is over. */
export function expectStructuredChatTerminalHold(token: string): () => void {
  beginning.add(token)
  return () => {
    beginning.delete(token)
    abandoned.delete(token)
  }
}

/** False when the client gave it up meanwhile. Throws, holding nothing, when it cannot be saved. */
export function beginStructuredChatTerminalHold(
  sessionId: string,
  handover: Pick<StructuredChatTerminalHold, 'token' | 'id' | 'agent' | 'conversationId'>
): boolean {
  if (abandoned.has(handover.token)) {
    return false
  }
  commitHold(sessionId, { ...handover, phase: 'opening', terminals: [], waiting: [] })
  return true
}

export function releaseStructuredChatTerminalHold(sessionId: string, token: string): boolean {
  const hold = loadedHolds().get(sessionId)
  if (hold?.token !== token) {
    return false
  }
  dropHold(sessionId)
  endInheritedHold(token)
  const ended = { sessionId, hold }
  for (const { ptyId } of hold.terminals) {
    askedHere.delete(ptyId ?? '')
  }
  for (const listener of listeners) {
    listener(ended)
  }
  return true
}

/** The client will launch nothing (more): releases the hold unless its terminal was asked for. */
export function abandonStructuredChatTerminalHold(sessionId: string, token: string): void {
  const hold = loadedHolds().get(sessionId)
  if (hold?.token === token) {
    if (hold.phase === 'opening') {
      releaseStructuredChatTerminalHold(sessionId, token)
    }
  } else if (beginning.has(token)) {
    abandoned.add(token)
  }
}

/** Keeps a conversation's hold while this process starts or restarts its agent in a terminal. */
export function keepStructuredChatHold(conversationId: string): () => void {
  starting.set(conversationId, (starting.get(conversationId) ?? 0) + 1)
  let done = false
  return () => {
    const count = (starting.get(conversationId) ?? 1) - 1
    if (!done && count > 0) {
      starting.set(conversationId, count)
    } else if (!done) {
      starting.delete(conversationId)
    }
    done = true
  }
}

/** A message came for a held chat and waits as this card. */
export function noteWaitingForStructuredChat(sessionId: string, messageId: string): void {
  const hold = loadedHolds().get(sessionId)
  if (hold && !hold.waiting.includes(messageId)) {
    learnHold(sessionId, { waiting: [...hold.waiting, messageId] })
  }
}

export function structuredChatTerminalStarting(hold: StructuredChatTerminalHold): boolean {
  return starting.has(hold.conversationId)
}

export type StructuredChatTerminalSpawn = {
  /** Right before the spawn. Throws when the handover ended first and the chat has its conversation
   *  back; nothing may be spawned for it then. */
  admit: (terminal: { ptyId: string | null; paneKey: string | null }) => void
  bind: (terminal: { ptyId: string; incarnationId: string | null; paneKey: string | null }) => void
  settle: (failed: boolean) => void
}

function withTerminal(
  hold: StructuredChatTerminalHold,
  terminal: Pick<StructuredChatHoldTerminal, 'ptyId' | 'incarnationId' | 'paneKey'>,
  asked: { ptyId: string | null } | null
): StructuredChatTerminalHold {
  const others = hold.terminals.filter(
    (other) =>
      !(asked && other.incarnationId === null && other.ptyId === asked.ptyId) &&
      !(other.ptyId === terminal.ptyId && other.incarnationId === terminal.incarnationId)
  )
  return { ...hold, phase: 'terminal', terminals: [...others, { ...terminal, ran: false }] }
}

/**
 * A terminal about to be started for a held conversation: the handover's own (it carries the token),
 * or another of Orca's or the person's (a restart on another account, a resume elsewhere), which is a
 * writer all the same and so joins the hold.
 */
export function claimStructuredChatTerminalSpawn(
  token: string | undefined,
  namesConversation: (conversationId: string) => boolean,
  /** A bare shell of a pane that once was a handover's is no start. */
  startsAgent = true
): StructuredChatTerminalSpawn | null {
  const found = [...loadedHolds()].find(([, hold]) =>
    token === undefined ? namesConversation(hold.conversationId) : hold.token === token
  )
  if (!found) {
    if (token === undefined || !startsAgent) {
      return null
    }
    const gone = (): never => {
      throw new Error('This conversation went back to its chat before the terminal opened.')
    }
    return { admit: gone, bind: () => undefined, settle: () => undefined }
  }
  const [sessionId, { token: mark, conversationId }] = found
  const current = (): StructuredChatTerminalHold | null => {
    const hold = loadedHolds().get(sessionId)
    return hold?.token === mark ? hold : null
  }
  const release = keepStructuredChatHold(conversationId)
  let asked: { ptyId: string | null } | null = null
  return {
    admit: ({ ptyId, paneKey }) => {
      const hold = current()
      if (!hold) {
        if (token === undefined) {
          return
        }
        throw new Error('This conversation went back to its chat before the terminal opened.')
      }
      commitHold(sessionId, withTerminal(hold, { ptyId, incarnationId: null, paneKey }, asked))
      asked = { ptyId }
      if (ptyId !== null) {
        askedHere.add(ptyId)
      }
    },
    bind: (terminal) => {
      const hold = current()
      if (hold) {
        const { terminals, phase } = withTerminal(hold, terminal, asked)
        learnHold(sessionId, { terminals, phase })
        askedHere.add(terminal.ptyId)
      }
    },
    settle: (failed) => {
      release()
      // Before it was asked for there is no terminal; after, the host looks for one.
      if (failed && token !== undefined) {
        abandonStructuredChatTerminalHold(sessionId, token)
      }
    }
  }
}

/** Ends an unlaunched handover with the client that began it. */
export const chatTerminalHandoverSubscription = (token: string): string =>
  `chat-terminal-handover:${token}`

export function structuredChatTerminalAskedHere(ptyId: string): boolean {
  return askedHere.has(ptyId)
}

/** An agent process in a terminal named its conversation: it runs there. */
export function noteStructuredChatTerminalReport(
  ptyId: string,
  conversationId: string | undefined
): void {
  const found = heldConversation(conversationId)
  if (found) {
    noteStructuredChatTerminalRan(found[0], ptyId)
  }
}

export function noteStructuredChatTerminalRan(sessionId: string, ptyId: string | null): void {
  const hold = loadedHolds().get(sessionId)
  if (hold?.terminals.some((terminal) => terminal.ptyId === ptyId && !terminal.ran)) {
    learnHold(sessionId, {
      terminals: hold.terminals.map((terminal) =>
        terminal.ptyId === ptyId ? { ...terminal, ran: true } : terminal
      )
    })
  }
}

/** Whether a hold's terminal may still write. Ends only by proof: the terminal is gone, or its shell
 *  is alone after the conversation's agent ran in it. */
export function structuredChatTerminalMayWrite(
  terminal: Pick<StructuredChatHoldTerminal, 'ran'>,
  pane: TerminalHoldPane
): boolean {
  switch (pane) {
    case 'unknown':
    case 'running':
      return true
    case 'absent':
      return false
    case 'shell':
      // Alone before the agent ran in it, it is only about to be given the command.
      return !terminal.ran
  }
}

/** After a restart nothing can spawn for an earlier Orca's handover that reached no terminal. */
export function releaseUnlaunchedStructuredChatTerminalHolds(): void {
  for (const [sessionId, hold] of loadedHolds()) {
    if (hold.phase === 'opening' && holdIsInherited(hold.token)) {
      releaseStructuredChatTerminalHold(sessionId, hold.token)
    }
  }
}

export function resetStructuredChatTerminalHoldsForTests(): void {
  resetHoldStoreForTests()
  for (const memory of [beginning, abandoned, askedHere, listeners]) {
    memory.clear()
  }
  starting.clear()
}
