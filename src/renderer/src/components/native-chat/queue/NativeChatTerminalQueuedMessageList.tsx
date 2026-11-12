import type { RefObject } from 'react'
import type { AgentType } from '../../../../../shared/agent-status/contracts/agent-status-types'
import { useTranslate } from '@/i18n/use-translate'
import { isMacPlatform } from '../pane/routing/native-chat-shortcut'
import { useNativeChatCtrlEnterSendsNow } from '../use-native-chat-ctrl-enter-sends-now'
import { NativeChatQueuedMessageList } from './NativeChatQueuedMessageList'
import type { QueuedMessageSteerShortcut } from './NativeChatQueuedMessageCard'
import { useNativeChatTerminalQueuedMessages } from './use-native-chat-terminal-queued-messages'

/** Claude's send-now key as a card shows it: Control on a Mac too, never Command. */
export function nativeChatCtrlEnterShortcut(): QueuedMessageSteerShortcut {
  return isMacPlatform()
    ? { inline: '⌃↵', keys: ['⌃', '⏎'] }
    : { inline: 'Ctrl+Enter', keys: ['Ctrl', 'Enter'] }
}

/**
 * Local build: the messages a terminal chat holds while its agent works, as the structured chat's
 * queued cards. Each card says quietly when it goes and how to send it now (Paweł, 2026-11-12:
 * "i dont see ctrl+enter hint for queued messages").
 */
export function NativeChatTerminalQueuedMessageList({
  paneKey,
  agent,
  turnActive,
  workingInterrupted,
  composerReady,
  composerRef
}: {
  paneKey: string
  agent: AgentType
  /** The agent works or waits on a question: its end sends the head card. */
  turnActive: boolean
  /** The person stopped the turn: nothing goes until the next one ends. */
  workingInterrupted: boolean
  /** No prompt card over the box, a terminal, input not held by a phone. */
  composerReady: boolean
  /** Where focus goes once Send, Delete or Edit takes the focused card away. */
  composerRef: RefObject<{ focus: () => boolean } | null>
}): React.JSX.Element {
  const t = useTranslate()
  // Why here, not in the chat view: the view sits at its line limit; this list is always mounted.
  const controller = useNativeChatTerminalQueuedMessages({
    paneKey,
    agent,
    turnActive,
    interrupted: workingInterrupted,
    ready: composerReady,
    composerRef
  })
  const ctrlEnterSendsNow = useNativeChatCtrlEnterSendsNow(agent, true)
  const shortcut = ctrlEnterSendsNow ? nativeChatCtrlEnterShortcut() : undefined
  const working = controller.isWorking
  const cardHint = (_card: unknown, index: number): string => {
    if (index === 0 && working && shortcut) {
      return t(
        'components.native-chat.queuedMessages.terminalHeadHint',
        'Goes when the turn ends · {{shortcut}} on an empty box sends it now',
        { shortcut: shortcut.inline }
      )
    }
    if (index === 0 && working) {
      return t(
        'components.native-chat.queuedMessages.terminalHeadNowHint',
        'Goes when the turn ends · Send sends it now'
      )
    }
    // Codex (and a turn that is over) gets the message typed with Enter, not delivered mid-turn.
    if (index === 0) {
      return t(
        'components.native-chat.queuedMessages.terminalHeadSendHint',
        'Goes when the turn ends · Send types it now'
      )
    }
    return t(
      'components.native-chat.queuedMessages.terminalWaitingHint',
      'Goes after the ones above · Send sends it now'
    )
  }
  return (
    <NativeChatQueuedMessageList
      controller={controller}
      chatWorktreeId={null}
      agentName={agent}
      focusComposer={() => composerRef.current?.focus()}
      steerShortcut={shortcut}
      cardHint={cardHint}
    />
  )
}
