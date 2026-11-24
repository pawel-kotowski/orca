import { useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { isAiVaultAgent } from '../../../../shared/ai-vault/contracts/ai-vault-types'
import {
  agentForksConversations,
  agentForksThroughChat
} from '../../../../shared/agent-launch/startup/agent-resume-argv'
import { adoptsCliConversations } from '../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'

/** How the chat's terminal button works: the conversation itself moves, or a copy of it opens. */
export type StructuredTerminalSwitch = 'same' | 'copy' | null

/**
 * A chat's own conversation can move to a terminal where the host can tell that terminal writes it
 * and reads its turns back afterwards; a bot keeps answering in its chat, so it gets a copy.
 */
export function structuredTerminalSwitch(
  scope: Pick<NativeChatStructuredAccountScope, 'agent' | 'worktreeId' | 'botName'>
): StructuredTerminalSwitch {
  const { agent } = scope
  if (!scope.worktreeId || !isAiVaultAgent(agent) || !agentForksConversations(agent)) {
    return null
  }
  return scope.botName === null && adoptsCliConversations(agent) && !agentForksThroughChat(agent)
    ? 'same'
    : 'copy'
}

// Chats on their way to a terminal, which reports only once its agent starts; by chat session.
export const chatTerminalOpening = new Map<string, string | null>()
const listeners = new Set<() => void>()

export function setChatTerminalOpening(
  sessionId: string,
  terminalTabId: string | null | undefined
): void {
  if (terminalTabId === undefined) {
    chatTerminalOpening.delete(sessionId)
  } else {
    chatTerminalOpening.set(sessionId, terminalTabId)
  }
  for (const listener of listeners) {
    listener()
  }
}

/** The terminal pane that runs this chat's own conversation now, other than the chat itself. */
export function structuredChatTerminalPane(
  state: Pick<AppState, 'agentStatusByPaneKey' | 'tabsByWorktree'>,
  chatPaneKey: string,
  worktreeId: string | null
): string | null {
  const conversation = state.agentStatusByPaneKey.get(chatPaneKey)?.providerSession?.id
  const tabs = worktreeId ? state.tabsByWorktree[worktreeId] : undefined
  if (!conversation || !tabs) {
    return null
  }
  for (const tab of tabs) {
    for (const [paneKey, entry] of state.agentStatusByPaneKey) {
      if (paneKey.startsWith(`${tab.id}:`) && entry.providerSession?.id === conversation) {
        return paneKey
      }
    }
  }
  return null
}

/** Where the chat's conversation is: here, on its way to a terminal, or in one (its tab). */
export function useStructuredChatTerminal(
  sessionId: string,
  chatPaneKey: string,
  worktreeId: string | null
): { tabId: string | null } | null {
  const pane = useAppStore((state) => structuredChatTerminalPane(state, chatPaneKey, worktreeId))
  const pending = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => chatTerminalOpening.get(sessionId)
  )
  if (pane) {
    return { tabId: pane.slice(0, pane.indexOf(':')) }
  }
  return pending === undefined ? null : { tabId: pending }
}

// The mounted button of each chat tab, which Cmd+Shift+J presses as it switches a terminal chat.
const switches = new Map<string, () => void>()

export function registerStructuredTerminalSwitch(tabId: string, press: () => void): () => void {
  switches.set(tabId, press)
  return () => {
    if (switches.get(tabId) === press) {
      switches.delete(tabId)
    }
  }
}

/** False where the chat offers no switch, so the key stays with the rest of the app. */
export function pressStructuredTerminalSwitch(tabId: string): boolean {
  const press = switches.get(tabId)
  press?.()
  return press !== undefined
}
