import { useNativeChatStructuredSentCommands } from './drafts/native-chat-structured-sent-commands'
import { structuredAgentSessionDraftScopeKey } from './drafts/native-chat-draft-scope'
import { useStructuredPromptCollapse } from './prompts/use-structured-prompt-collapse'
import { nativeChatCtrlEnterShortcut } from './queue/NativeChatTerminalQueuedMessageList'
import { useStructuredQueuedCardHint } from './queue/use-structured-queued-card-hint'
import { useStructuredTerminalSendHold } from './native-chat-structured-terminal-hold'
import { useStructuredChatTerminal } from './native-chat-structured-terminal'
import { useNativeChatCtrlEnterSendsNow } from './use-native-chat-ctrl-enter-sends-now'

/**
 * What a structured chat takes from the terminal chat (Paweł, 2026-11-24: "do it for all structured
 * chats, bring those things"), kept out of upstream's session view: a prompt card that folds away,
 * the queue's hint and chord, recall of sent commands, and the conversation's stay in a terminal.
 */
export function useStructuredChatParity(chat: {
  sessionId: string
  agent: string
  paneKey: string
  worktreeId: string | null
  isWorking: boolean
  prompt: Parameters<typeof useStructuredPromptCollapse>[1]
  promptsOpen: boolean
}) {
  const promptCollapse = useStructuredPromptCollapse(chat.sessionId, chat.prompt)
  const ctrlEnter = useNativeChatCtrlEnterSendsNow(chat.agent, 'structured')
  const cardHint = useStructuredQueuedCardHint({
    isWorking: chat.isWorking,
    promptOpen: chat.promptsOpen,
    ctrlEnterSteersHead: ctrlEnter
  })
  const sentCommands = useNativeChatStructuredSentCommands(
    structuredAgentSessionDraftScopeKey(chat.sessionId)
  )
  const terminal = useStructuredChatTerminal(chat.sessionId, chat.paneKey, chat.worktreeId)
  return {
    promptCollapse,
    /** The prompt's card has the input; folded, it gives the box back. */
    promptHoldsInput: chat.prompt !== null && !promptCollapse.collapsed,
    queue: { cardHint, steerShortcut: ctrlEnter ? nativeChatCtrlEnterShortcut() : undefined },
    sentCommands,
    terminal,
    terminalHold: useStructuredTerminalSendHold(terminal !== null)
  }
}
