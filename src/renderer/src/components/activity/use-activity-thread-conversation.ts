import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { isAiVaultAgent } from '../../../../shared/ai-vault/contracts/ai-vault-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import {
  summarizeNativeChatConversation,
  type NativeChatConversationSummary
} from '../../../../shared/native-chat/transcript/native-chat-conversation-summary'
import { resolveNativeChatSession } from '../native-chat/native-chat-pane-resolution'
import { createNativeChatRuntimeSelector } from '../native-chat/native-chat-runtime-owner'
import { useNativeChatRetainedSession } from '../native-chat/use-native-chat-retained-session'
import type { NativeChatLiveSession } from '../native-chat/use-native-chat-live-session'
import type { AgentPaneThread } from './activity-thread-types'

export type ActivityThreadConversation = {
  session: NativeChatLiveSession
  summary: NativeChatConversationSummary
  working: boolean
  paneKey: string
  sessionId: string | null
}

/** The agent-status entry that names this card's conversation. */
function threadEntry(thread: AgentPaneThread) {
  return thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry ?? null
}

// A session's first prompt never changes; read it once per session from its file.
const firstPromptBySession = new Map<string, Promise<string | null>>()

function readFirstPrompt(
  agent: string,
  filePath: string,
  sessionId: string
): Promise<string | null> {
  const cached = firstPromptBySession.get(sessionId)
  if (cached) {
    return cached
  }
  const getFirstUserPrompt = window.api?.aiVault?.getFirstUserPrompt
  const promise =
    isAiVaultAgent(agent) && typeof getFirstUserPrompt === 'function'
      ? getFirstUserPrompt({
          agent,
          filePath,
          sessionId,
          executionHostId: LOCAL_EXECUTION_HOST_ID
        })
          .then((result) => result.prompt?.trim() || null)
          .catch(() => null)
      : Promise.resolve(null)
  firstPromptBySession.set(sessionId, promise)
  return promise
}

/**
 * The card's conversation, read the way the chat reads it (no terminal needs to be mounted), and
 * summarized for a glance. Null for a card whose agent the chat cannot read.
 */
export function useActivityThreadConversation(
  thread: AgentPaneThread,
  enabled: boolean
): ActivityThreadConversation | null {
  const entry = threadEntry(thread)
  const resolution = resolveNativeChatSession({
    agentStatusEntry: entry ?? undefined,
    launchAgent: thread.tab.launchAgent,
    resolvedAgent: null,
    ptyId: null,
    paneKey: thread.paneKey
  })
  const selectOwner = useMemo(() => createNativeChatRuntimeSelector(thread.tab.id), [thread.tab.id])
  const runtimeEnvironmentId = useAppStore(selectOwner)
  const session = useNativeChatRetainedSession({
    paneKey: thread.paneKey,
    agent: resolution?.agent ?? 'claude',
    sessionId: resolution?.sessionId ?? null,
    transcriptPath: resolution?.transcriptPath ?? null,
    runtimeEnvironmentId,
    enabled: enabled && resolution !== null && resolution.sessionId !== null
  })
  const working = session.status === 'working' || thread.currentAgentState === 'working'
  const startsAtFirstMessage = !session.hasMore
  const summary = useMemo(
    () => summarizeNativeChatConversation(session.messages, { working, startsAtFirstMessage }),
    [session.messages, startsAtFirstMessage, working]
  )
  // Past the loaded window, the first prompt comes from the session's file (laptop sessions
  // only); a remote one falls back to the oldest prompt the status history kept.
  const [filePrompt, setFilePrompt] = useState<string | null>(null)
  const transcriptPath = resolution?.transcriptPath ?? null
  const sessionId = resolution?.sessionId ?? null
  const needsFilePrompt =
    enabled && summary.firstPrompt === null && session.messages.length > 0 && !startsAtFirstMessage
  const agent = resolution?.agent ?? null
  useEffect(() => {
    if (!needsFilePrompt || !agent || !transcriptPath || !sessionId || runtimeEnvironmentId) {
      return
    }
    let current = true
    void readFirstPrompt(agent, transcriptPath, sessionId).then((prompt) => {
      if (current) {
        setFilePrompt(prompt)
      }
    })
    return () => {
      current = false
    }
  }, [agent, needsFilePrompt, runtimeEnvironmentId, sessionId, transcriptPath])
  if (!resolution || session.messages.length === 0) {
    return null
  }
  const historyPrompt =
    entry?.stateHistory?.find((state) => state.prompt?.trim())?.prompt?.trim() ?? null
  return {
    session,
    summary: {
      ...summary,
      firstPrompt: summary.firstPrompt ?? filePrompt ?? historyPrompt
    },
    working,
    paneKey: thread.paneKey,
    sessionId
  }
}
