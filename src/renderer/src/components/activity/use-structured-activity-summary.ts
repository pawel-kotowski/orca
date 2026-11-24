import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { structuredChatTabById } from '@/lib/agent-session/tab-identity/structured-chat-tab-index'
import { callStructuredAgentSession } from '@/runtime/native-chat/requests/structured-agent-session-call'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForHost
} from '@/runtime/native-chat/session-ownership/structured-agent-session-owner'
import {
  AGENT_SESSION_HISTORY_MAX_LIMIT,
  type AgentSessionHistoryPage,
  type AgentSessionHistoryResult
} from '../../../../shared/agent-session/agent-session-wire'
import { projectStructuredAgentSessionMessages } from '../../../../shared/agent-session/view/structured-agent-session-message-projection'
import { resolveNativeChatTranscriptAgent } from '../../../../shared/native-chat/native-chat-agent-support'
import {
  summarizeNativeChatConversation,
  type NativeChatConversationSummary
} from '../../../../shared/native-chat/transcript/native-chat-conversation-summary'
import type { AgentPaneThread } from './threads/activity-thread-types'

/** Chats whose CLI keeps no transcript the card can read (Cursor, ACP agents, pi, OpenCode). */
export function readsChatFromJournal(agent: string | null | undefined): boolean {
  const transcriptAgent = resolveNativeChatTranscriptAgent(agent)
  return transcriptAgent === null || transcriptAgent === 'opencode'
}

export function summarizeStructuredHistory(
  page: Pick<AgentSessionHistoryPage, 'items' | 'submissions' | 'hasOlder'>,
  working: boolean,
  saying: string | undefined
): NativeChatConversationSummary {
  const summary = summarizeNativeChatConversation(
    projectStructuredAgentSessionMessages(page.items, [], page.submissions),
    { working, startsAtFirstMessage: !page.hasOlder }
  )
  // The page is read at the turn's edges; the status row streams what the agent says meanwhile.
  const now = working ? saying?.trim() : ''
  return now ? { ...summary, steps: [{ kind: 'said', text: now }] } : summary
}

/**
 * A card's conversation from the host's journal, read once per turn edge: a subscription per card
 * would count as a viewer and keep idle agents running.
 */
export function useStructuredActivitySummary(
  thread: AgentPaneThread,
  working: boolean,
  enabled: boolean
): NativeChatConversationSummary | null {
  const entry = thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry
  const tab = useAppStore((state) =>
    enabled && readsChatFromJournal(thread.agentType)
      ? structuredChatTabById(state.unifiedTabsByWorktree, thread.worktree.id, thread.tab.id)
      : undefined
  )
  const host = useAppStore((state) => (tab ? structuredAgentSessionOwnerForTab(state, tab) : null))
  const sessionId = tab?.entityId ?? null
  const [read, setRead] = useState<{ sessionId: string; page: AgentSessionHistoryPage } | null>(
    null
  )
  const edge = `${entry?.state}:${entry?.stateStartedAt}:${entry?.turnStartedAt}`
  useEffect(() => {
    const target = structuredAgentSessionTargetForHost(host)
    if (!sessionId || !target) {
      return undefined
    }
    let current = true
    callStructuredAgentSession<AgentSessionHistoryResult>(target, 'agentSession.history', {
      sessionId,
      direction: 'tail',
      limit: AGENT_SESSION_HISTORY_MAX_LIMIT
    })
      .then(({ page }) => {
        if (current) {
          setRead({ sessionId, page })
        }
      })
      // The card keeps its status summary.
      .catch(() => {})
    return () => {
      current = false
    }
  }, [edge, host, sessionId])
  const page = read && read.sessionId === sessionId ? read.page : null
  const saying = entry?.lastAssistantMessage
  return useMemo(
    () => (page ? summarizeStructuredHistory(page, working, saying) : null),
    [page, saying, working]
  )
}
