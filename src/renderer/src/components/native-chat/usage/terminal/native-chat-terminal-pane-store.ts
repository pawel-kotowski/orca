import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import type { NativeChatComposerNotice } from '../../composer/controls/native-chat-composer-notice'
import type { NativeChatContinueAfterSwitch } from './native-chat-terminal-continue-after-switch'

/**
 * One value per terminal chat pane, shared by parts of the pane that are siblings: the transcript
 * (where the usage-limit row lives), the hidden composer and the prompt card's slot. In memory,
 * so a remount (a restart on another account) keeps what is pending.
 */
export type NativeChatTerminalPaneSlot<T> = {
  get: (paneKey: string) => T | undefined
  set: (paneKey: string, value: T | undefined) => void
  useValue: (paneKey: string) => T | undefined
}

function paneSlot<T>(): NativeChatTerminalPaneSlot<T> {
  const values = new Map<string, T>()
  const listeners = new Map<string, Set<() => void>>()
  const subscribe = (paneKey: string, listener: () => void): (() => void) => {
    const set = listeners.get(paneKey) ?? new Set()
    listeners.set(paneKey, set)
    set.add(listener)
    return () => {
      set.delete(listener)
      if (set.size === 0 && listeners.get(paneKey) === set) {
        listeners.delete(paneKey)
      }
    }
  }
  const get = (paneKey: string): T | undefined => values.get(paneKey)
  const set = (paneKey: string, value: T | undefined): void => {
    if (values.get(paneKey) === value) {
      return
    }
    if (value === undefined) {
      values.delete(paneKey)
    } else {
      values.set(paneKey, value)
    }
    for (const listener of listeners.get(paneKey) ?? []) {
      listener()
    }
  }
  function useValue(paneKey: string): T | undefined {
    const bound = useCallback((listener: () => void) => subscribe(paneKey, listener), [paneKey])
    return useSyncExternalStore(bound, () => values.get(paneKey))
  }
  return { get, set, useValue }
}

/** A failed usage-limit Continue, shown with the composer's notices. */
export const terminalContinueError = paneSlot<NativeChatComposerNotice>()
/** The composer's notices while a prompt card hides it, for the slot above the card. */
export const terminalPromptSlotNotices = paneSlot<readonly NativeChatComposerNotice[]>()
/** A Continue waiting for Claude to restart on the account the person switched to. */
export const terminalContinueAfterSwitch = paneSlot<NativeChatContinueAfterSwitch>()
/** Cuts whose automatic continue the person cancelled or Orca already sent, by turn item id. */
export const terminalAutoContinueSettled = paneSlot<{
  turnItemId: string
  how: 'cancelled' | 'sent'
}>()

const NO_NOTICES: readonly NativeChatComposerNotice[] = []

/**
 * The terminal composer's two-way wiring: the chat's own notices take the pane's failed Continue,
 * and the composer's notices go to the prompt card's slot while the card hides the composer.
 */
export function useNativeChatTerminalComposerNotices(
  paneKey: string,
  terminal: boolean,
  chatNotices: readonly NativeChatComposerNotice[] | undefined
): {
  notices: readonly NativeChatComposerNotice[] | undefined
  publish: (notices: readonly NativeChatComposerNotice[] | null) => void
} {
  const continueError = terminalContinueError.useValue(paneKey)
  // Why memoized: a fresh array each render would rebuild the composer's notices on every keystroke.
  const notices = useMemo(
    () =>
      terminal && continueError ? [...(chatNotices ?? NO_NOTICES), continueError] : chatNotices,
    [terminal, continueError, chatNotices]
  )
  const publish = useCallback(
    (notices: readonly NativeChatComposerNotice[] | null) =>
      terminalPromptSlotNotices.set(paneKey, terminal && notices?.length ? notices : undefined),
    [paneKey, terminal]
  )
  return { notices, publish }
}

/** Publishes the composer's notices to the card's slot while the card owns the input. */
export function usePublishNativeChatPromptSlotNotices(
  publish: (notices: readonly NativeChatComposerNotice[] | null) => void,
  notices: readonly NativeChatComposerNotice[],
  inputOwnedByCard: boolean
): void {
  useEffect(() => {
    publish(inputOwnedByCard ? notices : null)
  }, [publish, notices, inputOwnedByCard])
  useEffect(() => () => publish(null), [publish])
}
