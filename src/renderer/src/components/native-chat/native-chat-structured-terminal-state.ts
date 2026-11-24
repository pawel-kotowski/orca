import { useSyncExternalStore } from 'react'
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

/**
 * A chat its host holds for a terminal, as this client launched or learned it. `cancel` gives up a
 * launch that has not answered yet; the host's own word decides whether a terminal came of it.
 */
export type ChatTerminalHold = { tabId: string | null; cancel?: () => void }

const heldChats = new Map<string, ChatTerminalHold>()
const listeners = new Set<() => void>()

export function chatTerminalHold(sessionId: string): ChatTerminalHold | undefined {
  return heldChats.get(sessionId)
}

export function setChatTerminalHold(sessionId: string, hold: ChatTerminalHold | null): void {
  if (hold) {
    heldChats.set(sessionId, hold)
  } else if (!heldChats.delete(sessionId)) {
    return
  }
  for (const listener of listeners) {
    listener()
  }
}

/** Where the chat's conversation is: here (null), or in a terminal (its tab, once known). */
export function useStructuredChatTerminal(sessionId: string): ChatTerminalHold | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => heldChats.get(sessionId) ?? null
  )
}

// The mounted chat of each tab, whose switch Cmd+Shift+J presses as it switches a terminal chat.
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
