import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { RuntimeClientTarget } from '../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type { NativeChatStructuredViewProps } from './native-chat-view-types'
import { useBotChatOwner } from '../bots/use-bot-chat-identity'

export type NativeChatTerminalAccountScope = {
  kind: 'terminal'
  agent: string
  transcriptPath: string | null
  terminalTabId: string
}

export type NativeChatStructuredAccountScope = {
  kind: 'structured'
  agent: string
  tabId: string
  sessionId: string
  target: RuntimeClientTarget
  worktreeId: string | null
  /** The bot whose chat this is, whose name places it better than its home folder's. */
  botName: string | null
}

/** Which chat the message box belongs to, so its controls can show that chat's Claude account. */
export type NativeChatAccountScope =
  | NativeChatTerminalAccountScope
  | NativeChatStructuredAccountScope

export const NativeChatAccountScopeContext = createContext<NativeChatAccountScope | null>(null)

/** The chat the message box belongs to; null outside a chat pane. */
export function useNativeChatAccountScope(): NativeChatAccountScope | null {
  return useContext(NativeChatAccountScopeContext)
}

/** Paweł's one surface (2026-11-05) for a box that only structured chats draw that way. */
export function useNativeChatStructuredSurface(surface: 'card' | 'tab'): {
  'data-native-chat-surface'?: string
} {
  return useContext(NativeChatAccountScopeContext)?.kind === 'structured'
    ? { 'data-native-chat-surface': surface }
    : {}
}

export function NativeChatAccountScopeProvider({
  agent,
  transcriptPath,
  terminalTabId,
  children
}: Omit<NativeChatTerminalAccountScope, 'kind'> & { children: ReactNode }): React.JSX.Element {
  const value = useMemo(
    () => ({ kind: 'terminal' as const, agent, transcriptPath, terminalTabId }),
    [agent, transcriptPath, terminalTabId]
  )
  return (
    <NativeChatAccountScopeContext.Provider value={value}>
      {children}
    </NativeChatAccountScopeContext.Provider>
  )
}

export function NativeChatStructuredAccountScopeProvider({
  chat,
  children
}: {
  chat: Pick<NativeChatStructuredViewProps, 'tabId' | 'sessionId' | 'target' | 'agent'>
  children: ReactNode
}): React.JSX.Element {
  const { agent, tabId, sessionId, target } = chat
  const { ownerWorktreeId: worktreeId, bot } = useBotChatOwner(chat)
  const botName = bot?.name ?? null
  const value = useMemo(
    () => ({ kind: 'structured' as const, agent, tabId, sessionId, target, worktreeId, botName }),
    [agent, tabId, sessionId, target, worktreeId, botName]
  )
  return (
    <NativeChatAccountScopeContext.Provider value={value}>
      {children}
    </NativeChatAccountScopeContext.Provider>
  )
}
