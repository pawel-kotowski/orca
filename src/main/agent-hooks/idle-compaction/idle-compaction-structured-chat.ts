import type { AgentSessionContextUsage } from '../../../shared/agent-session/conversation-context/agent-session-context-usage'
import { contextTokensFromUsage } from '../../../shared/agent-session/conversation-context/agent-session-context-usage'
import { agentSessionConversationCommandFields } from '../../../shared/agent-session/conversation-context/agent-session-conversation-command'
import { structuredAgentSessionPayloadFingerprint } from '../../../shared/agent-session/lifecycle/operations/structured-agent-session-mutation'
import { getStructuredAgentSessionHost } from '../../native-chat/agent-session-wire/host/structured-agent-session-registry'
import { structuredAgentSessionProviderSessionMetadata } from '../../native-chat/agent-session-wire/publication/history/structured-agent-session-history-result'
import { isBotGroupMemberSession } from '../../../shared/bots/bot-group'
import { structuredChatTerminalHold } from '../../runtime/agent-session/ownership/structured-chat-terminal-holds'
import { resolveSessionFilePath } from '../../native-chat/session-file-resolver'
import { mintAgentSessionOperationId } from '../../runtime/orchestration/mailbox/structured-pointer/structured-pointer-operation-id'
import {
  readIdleCompactionSessionFacts,
  type IdleCompactionAgent,
  type IdleCompactionSessionFacts
} from './idle-compaction-session-facts'

/** A chat whose turn ended, as its status row names it. */
export type IdleCompactionChat = { sessionId: string; providerSessionId: string }

export type IdleCompactionChatTarget = {
  transcriptPath: (agent: IdleCompactionAgent, chat: IdleCompactionChat) => Promise<string | null>
  readFacts: (
    agent: IdleCompactionAgent,
    chat: IdleCompactionChat,
    transcriptPath: string | null,
    since: number
  ) => Promise<IdleCompactionSessionFacts>
  /** Why compacting now would be wrong: a chat that is closed, asleep or on another conversation. */
  hold: (chat: IdleCompactionChat) => 'no_terminal' | 'held' | 'superseded' | null
  /** False when the host refused it: a pending prompt, a running turn, an unsettled message. */
  compact: (chat: IdleCompactionChat) => Promise<boolean>
}

/** Null after a compaction, a /clear or a model change: nothing to measure. */
export function contextTokensOfUsage(usage: AgentSessionContextUsage): number | null {
  const { used } = usage
  return used?.kind === 'report'
    ? used.usedTokens
    : used?.kind === 'estimate'
      ? contextTokensFromUsage(used.usage)
      : null
}

/** The journal knows the context as the chat holds it now; only the CLI's transcript knows the cache. */
export function chatCompactionFacts(
  journalTokens: number | null,
  transcript: IdleCompactionSessionFacts | null
): IdleCompactionSessionFacts {
  return {
    contextTokens: journalTokens,
    compactedSince: transcript?.compactedSince ?? false,
    ...(transcript?.cacheTtl ? { cacheTtl: transcript.cacheTtl } : {})
  }
}

export const structuredIdleCompactionTarget: IdleCompactionChatTarget = {
  transcriptPath: (agent, chat) => resolveSessionFilePath(agent, chat.providerSessionId),
  readFacts: async (agent, chat, transcriptPath, since) => {
    const reads = await getStructuredAgentSessionHost()?.journalReads(chat.sessionId)
    const tokens = reads ? contextTokensOfUsage(await reads.contextUsage()) : null
    return chatCompactionFacts(
      tokens,
      transcriptPath ? await readIdleCompactionSessionFacts(agent, transcriptPath, since) : null
    )
  },
  hold: ({ sessionId, providerSessionId }) => {
    const store = getStructuredAgentSessionHost()?.deps.store
    const record = store?.getConversation(sessionId)
    if (!store || !record || store.isSessionTabRetired(sessionId)) {
      return 'no_terminal'
    }
    // A send would end the user's own Sleep; a group room spends its members' turns itself; a
    // terminal has the conversation.
    if (
      record.sleptAt !== undefined ||
      isBotGroupMemberSession(sessionId) ||
      structuredChatTerminalHold(sessionId) !== null
    ) {
      return 'held'
    }
    return structuredAgentSessionProviderSessionMetadata(record)?.id === providerSessionId
      ? null
      : 'superseded'
  },
  compact: async ({ sessionId }) => {
    const host = getStructuredAgentSessionHost()
    const fence = host?.deps.store.getConversation(sessionId)?.currentFence
    if (!host || fence === undefined) {
      throw new Error('no_host')
    }
    // No `delivery`: a busy chat refuses instead of queueing. A stopped agent is started for it.
    const result = await host.conversationCommand(
      { callerKey: 'trusted-local:idle-compaction' },
      {
        command: 'compact',
        envelope: {
          sessionId,
          clientOperationId: mintAgentSessionOperationId(Date.now()),
          expectedRuntimeFence: fence,
          payloadFingerprint: structuredAgentSessionPayloadFingerprint({
            method: 'agentSession.conversationCommand',
            sessionId,
            fields: agentSessionConversationCommandFields('compact')
          })
        }
      }
    )
    if (!result.ok) {
      return false
    }
    if (result.value.state === 'unknown' || result.value.error) {
      throw new Error(result.value.error ?? 'unknown')
    }
    return true
  }
}
