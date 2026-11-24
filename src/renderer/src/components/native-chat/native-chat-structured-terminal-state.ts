import { useMemo, useSyncExternalStore } from 'react'
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

/** A chat its host holds for a terminal; `launching` until its tab is known or will not be. */
export type ChatTerminalHold = { tabId: string | null; launching: boolean }

// By chat session: what this client launched, or learned from the host after a reload.
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

type Panes = Pick<AppState, 'agentStatusByPaneKey' | 'tabsByWorktree'>

// One index per status map: every store change asks, few change the map.
const paneIndexes = new WeakMap<Panes['agentStatusByPaneKey'], Map<string, string[]>>()

function panesByConversation(statuses: Panes['agentStatusByPaneKey']): Map<string, string[]> {
  let index = paneIndexes.get(statuses)
  if (!index) {
    index = new Map()
    for (const [paneKey, entry] of statuses) {
      const id = entry.providerSession?.id
      if (id) {
        index.set(id, [...(index.get(id) ?? []), paneKey])
      }
    }
    paneIndexes.set(statuses, index)
  }
  return index
}

/** The terminal pane that runs this chat's own conversation now, other than the chat itself. */
export function structuredChatTerminalPane(
  state: Panes,
  chatPaneKey: string,
  worktreeId: string | null
): string | null {
  const conversation = state.agentStatusByPaneKey.get(chatPaneKey)?.providerSession?.id
  if (!conversation || !worktreeId) {
    return null
  }
  const panes = panesByConversation(state.agentStatusByPaneKey).get(conversation) ?? []
  return (
    panes.find(
      (paneKey) =>
        paneKey !== chatPaneKey &&
        (state.tabsByWorktree[worktreeId] ?? []).some((tab) => paneKey.startsWith(`${tab.id}:`))
    ) ?? null
  )
}

/** Where the chat's conversation is: here (null), or in a terminal (its tab, once known). */
export function useStructuredChatTerminal(
  sessionId: string,
  chatPaneKey: string,
  worktreeId: string | null
): ChatTerminalHold | null {
  const pane = useAppStore((state) => structuredChatTerminalPane(state, chatPaneKey, worktreeId))
  const held = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => heldChats.get(sessionId)
  )
  const paneTab = pane ? pane.slice(0, pane.indexOf(':')) : null
  return useMemo(
    () => (paneTab ? { tabId: paneTab, launching: false } : (held ?? null)),
    [paneTab, held]
  )
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
