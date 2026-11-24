import { useCallback } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import {
  queuedMessageCardSteers,
  type QueuedMessageCard
} from '../../../../../shared/agent-session/view/structured-agent-session-queued-cards'
import { nativeChatCtrlEnterShortcut } from './NativeChatTerminalQueuedMessageList'

/** When a plainly waiting card goes and how to send it now; a card on hold says its own why. */
export function useStructuredQueuedCardHint({
  isWorking,
  inTerminal,
  promptOpen,
  ctrlEnterSteersHead
}: {
  isWorking: boolean
  /** A terminal has the conversation: its host sends no card before it is back. */
  inTerminal: boolean
  /** The host sends no card before the open question or approval is answered. */
  promptOpen: boolean
  ctrlEnterSteersHead: boolean
}): (card: QueuedMessageCard, index: number) => string | null {
  const t = useTranslate()
  return useCallback(
    (card, index) => {
      if (card.hold !== 'turn') {
        return null
      }
      if (inTerminal) {
        return t(
          'components.native-chat.queuedMessages.structuredTerminalHint',
          'Goes once this chat is back from its terminal'
        )
      }
      if (promptOpen) {
        return t(
          'components.native-chat.queuedMessages.structuredPromptHint',
          'Goes after you answer the agent'
        )
      }
      if (!isWorking) {
        return null
      }
      if (index > 0) {
        return t(
          'components.native-chat.queuedMessages.structuredWaitingHint',
          'Goes after the ones above'
        )
      }
      // A command never steers into a running turn.
      return ctrlEnterSteersHead && queuedMessageCardSteers(card)
        ? t(
            'components.native-chat.queuedMessages.terminalHeadHint',
            'Goes when the turn ends · {{shortcut}} on an empty box sends it now',
            { shortcut: nativeChatCtrlEnterShortcut().inline }
          )
        : t('components.native-chat.queuedMessages.structuredHeadHint', 'Goes when the turn ends')
    },
    [t, isWorking, inTerminal, promptOpen, ctrlEnterSteersHead]
  )
}
