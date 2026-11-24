import { join } from 'node:path'
import { agentSessionAccountHomePath } from '../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
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
  idleCompactionHome,
  idleCompactionLimitSpent,
  type IdleCompactionRateLimits
} from './idle-compaction-account-limit'
import {
  readIdleCompactionSessionFacts,
  type IdleCompactionAgent,
  type IdleCompactionSessionFacts
} from './idle-compaction-session-facts'

/** A chat whose turn ended, as its status row names it. */
export type IdleCompactionChat = { sessionId: string; providerSessionId: string }

/** Claude only: the folder of the account the chat's agent would compact on, and its transcript there. */
export type IdleCompactionChatSource = { transcriptPath: string | null; configDir: string | null }

export type IdleCompactionChatTarget = {
  source: (
    agent: IdleCompactionAgent,
    chat: IdleCompactionChat
  ) => Promise<IdleCompactionChatSource>
  readFacts: (
    agent: IdleCompactionAgent,
    chat: IdleCompactionChat,
    transcriptPath: string | null,
    since: number
  ) => Promise<IdleCompactionSessionFacts>
  /** Why compacting now would be wrong: a chat that is closed, asleep or on another conversation. */
  hold: (chat: IdleCompactionChat) => 'no_terminal' | 'held' | 'superseded' | null
  /** False when the host refused it: the chat is not at rest, or its account's limit is spent. */
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

export const structuredIdleCompactionTarget = (
  rateLimits: () => IdleCompactionRateLimits | null
): IdleCompactionChatTarget => ({
  source: async (agent, { sessionId, providerSessionId }) => {
    if (agent !== 'claude') {
      const transcriptPath = await resolveSessionFilePath(agent, providerSessionId)
      return { transcriptPath, configDir: null }
    }
    const host = getStructuredAgentSessionHost()
    const record = host?.deps.store.getRecord(sessionId)
    const home =
      host && record?.location.wslDistro === null ? await idleCompactionHome(host, record) : null
    const configDir = agentSessionAccountHomePath(home)
    return {
      configDir,
      transcriptPath: configDir
        ? await resolveSessionFilePath(agent, providerSessionId, {
            claudeProjectsDir: join(configDir, 'projects')
          })
        : null
    }
  },
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
    const record = host?.deps.store.getRecord(sessionId)
    if (!host || !record || fence === undefined) {
      throw new Error('no_host')
    }
    if (await idleCompactionLimitSpent(host, record, rateLimits())) {
      return false
    }
    // Refused unless the chat is at rest as the host accepts it. A stopped agent is started for it.
    const result = await host.conversationCommand(
      { callerKey: 'trusted-local:idle-compaction' },
      {
        command: 'compact',
        atRest: true,
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
})
