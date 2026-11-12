import { isMacPlatform } from '../../pane/routing/native-chat-shortcut'
import type { NativeChatComposerSendState } from './native-chat-composer-send-state'

/** Claude's send-now chord as the box names it: Control on a Mac too, never Command. */
export function nativeChatCtrlEnterLabel(): string {
  return isMacPlatform() ? '⌃ Enter' : 'Ctrl+Enter'
}

/**
 * Local build: in a working terminal Claude chat Ctrl+Enter does the other thing than Queue
 * follow-ups (on: Enter holds the message in Orca and the chord sends it now; off: Enter sends now
 * and the chord holds it), so the box offers Ctrl+Enter as that alternate, as a structured chat
 * offers Cmd/Ctrl+Enter (the chip beside Send, Send's tooltip and the held-key preview of #38749),
 * and on an empty box the chord sends the head held message.
 */
export function withNativeChatTerminalSendNow<T extends NativeChatComposerSendState>(
  state: T,
  /** Ctrl+Enter sends now here, the agent works, and the draft is a message. */
  sendsNow: boolean,
  /** Settings → Chat → Queue follow-ups; absent = on. */
  queueFollowUps = true
): T & { alternateSendShortcut?: string } {
  if (!sendsNow) {
    return state
  }
  return {
    ...state,
    alternateSend: queueFollowUps ? 'steer' : 'queue',
    chordSteersHead: true,
    alternateSendShortcut: nativeChatCtrlEnterLabel()
  }
}
