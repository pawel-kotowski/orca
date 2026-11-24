import { useEffect } from 'react'
import { useNativeChatStructuredSentCommands } from './drafts/native-chat-structured-sent-commands'
import { useNativeChatDraftWritten } from './drafts/use-native-chat-draft-written'
import { structuredAgentSessionDraftScopeKey } from './drafts/native-chat-draft-scope'
import { useStructuredPromptCollapse } from './prompts/use-structured-prompt-collapse'
import { nativeChatCtrlEnterShortcut } from './queue/NativeChatTerminalQueuedMessageList'
import { useStructuredQueuedCardHint } from './queue/use-structured-queued-card-hint'
import { useStructuredChatTerminal } from './native-chat-structured-terminal-state'
import { useAppStore } from '@/store'
import { nativeChatQueueFollowUps } from '../../../../shared/native-chat/input/composer/native-chat-follow-up-behavior'
import { isMacPlatform } from './pane/routing/native-chat-shortcut'
import { useNativeChatAccountScope } from './native-chat-account-scope'
import { readChatTerminalHold } from './native-chat-structured-terminal'
import { useNativeChatCtrlEnterSendsNow } from './use-native-chat-ctrl-enter-sends-now'

const HOLD_CHECK_MS = 2_000

/** Asks the host once when the chat shows, and on while a terminal has its conversation. */
function useFollowChatTerminalHold(isVisible: boolean, held: boolean): void {
  const scope = useNativeChatAccountScope()
  const chat = scope?.kind === 'structured' ? scope : null
  useEffect(() => {
    if (!chat || !isVisible) {
      return
    }
    void readChatTerminalHold(chat)
    if (!held) {
      return
    }
    const timer = window.setInterval(() => void readChatTerminalHold(chat), HOLD_CHECK_MS)
    return () => window.clearInterval(timer)
  }, [chat, isVisible, held])
}

/**
 * What a structured chat takes from the terminal chat (Paweł, 2026-11-24: "do it for all structured
 * chats, bring those things"), kept out of upstream's session view: a prompt card that folds away,
 * the queue's hint and chord, recall of sent commands, and the conversation's stay in a terminal.
 */
export function useStructuredChatParity(chat: {
  sessionId: string
  agent: string
  isWorking: boolean
  prompt: Parameters<typeof useStructuredPromptCollapse>[1]
  promptsOpen: boolean
  isVisible: boolean
}) {
  const promptCollapse = useStructuredPromptCollapse(chat.sessionId, chat.prompt)
  const ctrlEnter = useNativeChatCtrlEnterSendsNow(chat.agent, 'structured')
  const queueFollowUps = useAppStore((state) => nativeChatQueueFollowUps(state.settings))
  const terminal = useStructuredChatTerminal(chat.sessionId)
  const drafting = useNativeChatDraftWritten(structuredAgentSessionDraftScopeKey(chat.sessionId))
  const cardHint = useStructuredQueuedCardHint({
    isWorking: chat.isWorking,
    inTerminal: terminal !== null,
    promptOpen: chat.promptsOpen,
    // With words in the box the chord is theirs.
    ctrlEnterSteersHead: ctrlEnter && !drafting && (queueFollowUps || isMacPlatform())
  })
  const sentCommands = useNativeChatStructuredSentCommands(
    structuredAgentSessionDraftScopeKey(chat.sessionId)
  )
  useFollowChatTerminalHold(chat.isVisible, terminal !== null)
  return {
    promptCollapse,
    /** The prompt's card has the input; folded, it gives the box back. */
    promptHoldsInput: chat.prompt !== null && !promptCollapse.collapsed,
    queue: {
      cardHint,
      // With words in the box that chord is theirs; the card then names its own.
      steerShortcut: ctrlEnter && !drafting ? nativeChatCtrlEnterShortcut() : undefined
    },
    sentCommands,
    terminal
  }
}
