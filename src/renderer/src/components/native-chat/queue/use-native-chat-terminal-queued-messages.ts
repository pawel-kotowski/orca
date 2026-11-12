// Local build: the terminal chat's queue. While the agent works, Enter holds the message in Orca
// (`useNativeChatTerminalHold`); the cards drive the structured chat's queue list; each turn's end
// types the head card with plain Enter, as the structured chat's queue sends one card per turn.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject
} from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { appendToNativeChatComposerDraft } from '../drafts/native-chat-composer-draft-store'
import type { StructuredAgentSessionQueuedMessagesController } from './use-structured-agent-session-queued-messages'
import {
  clearNativeChatTerminalHeldMessages,
  holdNativeChatTerminalMessage,
  moveNativeChatTerminalHeldMessage,
  nativeChatTerminalHeldCards,
  readNativeChatTerminalHeldMessages,
  registerNativeChatTerminalHeldSender,
  sendNativeChatTerminalHeldMessage,
  subscribeToNativeChatTerminalHeldMessages,
  takeNativeChatTerminalHeldMessage,
  type NativeChatTerminalHeldImage,
  type NativeChatTerminalHeldMessage,
  type NativeChatTerminalHeldSender
} from './native-chat-terminal-held-messages'

/** A message the composer is about to type; true when Orca holds it instead. */
export type NativeChatTerminalHold = (message: {
  text: string
  images: readonly NativeChatTerminalHeldImage[]
}) => boolean

export function useNativeChatTerminalHeldMessages(
  paneKey: string
): readonly NativeChatTerminalHeldMessage[] {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToNativeChatTerminalHeldMessages(paneKey, listener),
    [paneKey]
  )
  const read = useCallback(() => readNativeChatTerminalHeldMessages(paneKey), [paneKey])
  return useSyncExternalStore(subscribe, read, read)
}

/** The composer's hold while its terminal agent works; absent when Enter should type at once. */
export function useNativeChatTerminalHold(
  paneKey: string,
  holds: boolean
): NativeChatTerminalHold | undefined {
  return useMemo(
    () =>
      holds
        ? (message) => {
            holdNativeChatTerminalMessage(paneKey, {
              text: message.text,
              // Only what a send and a hand-back need: a preview URL can pin a whole clipboard blob.
              images: message.images.map(({ id, path, connectionId }) => ({
                ...(id ? { id } : {}),
                path,
                ...(connectionId ? { connectionId } : {})
              }))
            })
            return true
          }
        : undefined,
    [paneKey, holds]
  )
}

/** Lets the pane's queue type a held message through this composer's own terminal send. */
export function useNativeChatTerminalHeldSender(
  paneKey: string,
  sender: NativeChatTerminalHeldSender | undefined
): void {
  const latest = useRef(sender)
  useEffect(() => {
    latest.current = sender
  })
  const registered = sender !== undefined
  useEffect(() => {
    if (!registered) {
      return
    }
    return registerNativeChatTerminalHeldSender(
      paneKey,
      (message, sendNow) => latest.current?.(message, sendNow) ?? false
    )
  }, [paneKey, registered])
}

/**
 * One step of the turn-end drain. A turn arms it; its end (not a Stop) sends the head card once
 * the box can type. A send that could not go keeps it armed, to try again when the box can.
 */
export function nativeChatTerminalDrainStep(state: {
  armed: boolean
  turnActive: boolean
  interrupted: boolean
  ready: boolean
  hasHeld: boolean
}): { armed: boolean; drain: boolean } {
  if (state.turnActive) {
    return { armed: true, drain: false }
  }
  // Stop means stop: the held cards stay until the next turn ends or the person sends them.
  if (state.interrupted || !state.armed || !state.hasHeld) {
    return { armed: false, drain: false }
  }
  if (!state.ready) {
    return { armed: true, drain: false }
  }
  return { armed: false, drain: true }
}

let handBackImageId = 0

/**
 * Sends one held message now: with Claude's send-now key while Claude works, otherwise as Enter
 * types it (Codex has no send-now key and queues the message itself). False, with a toast, when
 * the box could not type it; the card then stays.
 */
export function sendNativeChatTerminalHeldMessageNow(
  paneKey: string,
  messageId: string,
  sendsNow: boolean
): boolean {
  const message = readNativeChatTerminalHeldMessages(paneKey).find((held) => held.id === messageId)
  if (!message) {
    return false
  }
  if (!sendNativeChatTerminalHeldMessage(paneKey, message, sendsNow)) {
    toast.error(translate('components.native-chat.messageNotSent', 'Message not sent'))
    return false
  }
  takeNativeChatTerminalHeldMessage(paneKey, messageId)
  return true
}

/** The terminal box's Ctrl+Enter (empty box) and Cmd/Ctrl+Shift+Enter: the head held message now. */
export function useNativeChatTerminalSteerHead(
  paneKey: string,
  enabled: boolean,
  sendsNow: boolean
): (() => boolean) | undefined {
  const head = useNativeChatTerminalHeldMessages(paneKey)[0]
  return useMemo(
    () =>
      enabled && head
        ? () => sendNativeChatTerminalHeldMessageNow(paneKey, head.id, sendsNow)
        : undefined,
    [enabled, head, paneKey, sendsNow]
  )
}

export function useNativeChatTerminalQueuedMessages(args: {
  paneKey: string
  agent: AgentType
  /** Working or waiting on a question: the turn whose end sends the next card, and into which
   *  Claude takes a card's Send at once with its send-now key. */
  turnActive: boolean
  /** The person stopped the turn. */
  interrupted: boolean
  /** The box can type: no prompt card over it, a terminal, input not held by a phone. */
  ready: boolean
  /** Where Edit hands a message back to. */
  composerRef?: RefObject<{ focus: () => boolean } | null>
}): StructuredAgentSessionQueuedMessagesController {
  const { paneKey, agent, turnActive, interrupted, ready, composerRef } = args
  const messages = useNativeChatTerminalHeldMessages(paneKey)
  const cards = useMemo(() => nativeChatTerminalHeldCards(messages), [messages])
  // Codex has no send-now key: its Send types with Enter and Codex queues the message itself.
  const sendsNow = agent === 'claude' && turnActive

  const steer = useCallback(
    async (messageId: string): Promise<void> => {
      sendNativeChatTerminalHeldMessageNow(paneKey, messageId, sendsNow)
    },
    [paneKey, sendsNow]
  )

  const remove = useCallback(
    async (messageId: string): Promise<void> => {
      takeNativeChatTerminalHeldMessage(paneKey, messageId)
    },
    [paneKey]
  )

  // Edit hands the message back to the message box, images included; Enter holds it again.
  const edit = useCallback(
    async (messageId: string): Promise<void> => {
      const message = takeNativeChatTerminalHeldMessage(paneKey, messageId)
      if (!message) {
        return
      }
      appendToNativeChatComposerDraft(paneKey, {
        text: message.text,
        images: message.images.map((image) => ({
          id: image.id ?? `terminal-held-image-${++handBackImageId}`,
          path: image.path,
          ...(image.connectionId ? { connectionId: image.connectionId } : {})
        }))
      })
      composerRef?.current?.focus()
    },
    [composerRef, paneKey]
  )

  const clear = useCallback(async (): Promise<boolean> => {
    clearNativeChatTerminalHeldMessages(paneKey)
    return true
  }, [paneKey])

  const move = useCallback<
    NonNullable<StructuredAgentSessionQueuedMessagesController['reorder']>['move']
  >(
    async (messageId, anchor) => moveNativeChatTerminalHeldMessage(paneKey, messageId, anchor),
    [paneKey]
  )
  const reorder = useMemo(
    () => ({ scope: `terminal-held:${paneKey}`, pending: false, move }),
    [move, paneKey]
  )

  const steerHead = useNativeChatTerminalSteerHead(paneKey, true, sendsNow)

  const hasHeld = messages.length > 0
  // Why armed when mounting with held cards: the drain runs only while the chat is mounted, so a
  // turn that ended while the pane showed its terminal sends the head card once the chat is back.
  const armed = useRef(hasHeld)
  useEffect(() => {
    const step = nativeChatTerminalDrainStep({
      armed: armed.current,
      turnActive,
      interrupted,
      ready,
      hasHeld
    })
    armed.current = step.armed
    if (!step.drain) {
      return
    }
    const next = readNativeChatTerminalHeldMessages(paneKey)[0]
    // Plain Enter: the turn is over, so the card starts the next one.
    if (next && sendNativeChatTerminalHeldMessage(paneKey, next, false)) {
      takeNativeChatTerminalHeldMessage(paneKey, next.id)
    } else {
      armed.current = true
    }
  }, [hasHeld, interrupted, paneKey, ready, turnActive])

  return {
    cards,
    reorder,
    queueCapable: true,
    clearCapable: true,
    pause: null,
    resume: async () => false,
    clear,
    queuePending: null,
    pending: () => null,
    steer,
    remove,
    editCapable: true,
    editor: undefined,
    edit,
    steerHead,
    isWorking: sendsNow
  }
}
