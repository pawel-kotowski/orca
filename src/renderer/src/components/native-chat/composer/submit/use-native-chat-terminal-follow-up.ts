import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { nativeChatQueueFollowUps } from '../../../../../../shared/native-chat/input/native-chat-follow-up-behavior'
import type { NativeChatPtySendDelivery } from './use-native-chat-pty-composer-send'

type PtySend = (
  retry?: { text: string; imagePaths?: string[] },
  delivery?: NativeChatPtySendDelivery
) => boolean

// Why: some tests stand a plain object in for the store; upstream's default (queue) holds there.
const useQueueFollowUpsSetting: () => boolean =
  typeof useAppStore === 'function'
    ? () => useAppStore((state) => nativeChatQueueFollowUps(state.settings))
    : () => true

/**
 * Local build: how a terminal chat's send goes while its agent works, by Settings → Chat → Queue
 * follow-ups, as the structured chat's does (Paweł, 2026-11-12: with it off his message "doesnt
 * reach you until i press ctrl enter"). On: a plain send waits as a held card and Ctrl/Cmd+Enter
 * goes now. Off: a plain send goes now (Claude's send-now key; Codex types it) and the chord holds
 * it as a card. Undefined delivery means "hold"; a retry or a held card's own send is left alone.
 */
export function terminalFollowUpDelivery(
  queueFollowUps: boolean,
  working: boolean,
  retry: unknown,
  delivery: NativeChatPtySendDelivery | undefined
): NativeChatPtySendDelivery | undefined {
  if (!working || retry || delivery?.held) {
    return delivery
  }
  const chord = delivery?.sendNow === true || delivery?.alternate === true
  return queueFollowUps === chord ? { sendNow: true } : undefined
}

/** The box's send, following Queue follow-ups while the agent works; whether follow-ups queue. */
export function useNativeChatTerminalFollowUpSend(
  sendPty: PtySend,
  working: boolean
): { send: PtySend; queueFollowUps: boolean } {
  const queueFollowUps = useQueueFollowUpsSetting()
  const send = useCallback<PtySend>(
    (retry, delivery) =>
      sendPty(retry, terminalFollowUpDelivery(queueFollowUps, working, retry, delivery)),
    [sendPty, queueFollowUps, working]
  )
  return { send, queueFollowUps }
}
