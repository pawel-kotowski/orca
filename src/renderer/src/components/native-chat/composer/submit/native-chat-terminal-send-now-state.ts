import { isMacPlatform } from '../../pane/routing/native-chat-shortcut'
import type { NativeChatComposerSendState } from './native-chat-composer-send-state'

/** Claude's send-now chord as the box names it: Control on a Mac too, never Command. */
export function nativeChatCtrlEnterLabel(): string {
  return isMacPlatform() ? '⌃ Enter' : 'Ctrl+Enter'
}

/**
 * Local build: in a working terminal Claude chat Enter holds the message in Orca and Ctrl+Enter
 * sends it now, so the box offers Ctrl+Enter as its steer, as a structured chat offers Cmd/Ctrl+Enter
 * (the chip beside Send, Send's tooltip and the held-key preview of #38749), and on an empty box
 * the chord sends the head held message.
 */
export function withNativeChatTerminalSendNow<T extends NativeChatComposerSendState>(
  state: T,
  /** Ctrl+Enter sends now here, the agent works, and the draft is a message. */
  sendsNow: boolean
): T & { alternateSendShortcut?: string } {
  if (!sendsNow) {
    return state
  }
  return {
    ...state,
    alternateSend: 'steer',
    chordSteersHead: true,
    alternateSendShortcut: nativeChatCtrlEnterLabel()
  }
}
