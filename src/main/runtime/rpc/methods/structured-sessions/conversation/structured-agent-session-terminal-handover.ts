import type { AgentSessionTerminalHandoverResult } from '../../../../../../shared/agent-session/lifecycle/operations/agent-session-terminal-handover'
import { AgentSessionTerminalHandoverParams } from '../../../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-terminal-handover-params'
import { agentForksThroughChat } from '../../../../../../shared/agent-launch/startup/agent-resume-argv'
import { adoptsCliConversations } from '../../../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { isNativeLocalLocation } from '../../../../../../shared/execution-host/execution-host'
import { botOfSession } from '../../../../../bots/bot-session-tabs'
import { recordConversationKey } from '../../../../../native-chat/conversation-adoption/structured-conversation-key'
import {
  beginStructuredChatTerminalHold,
  bindStructuredChatTerminalHold,
  releaseStructuredChatTerminalHold,
  structuredChatTerminalHold
} from '../../../../agent-session/ownership/structured-chat-terminal-holds'
import { defineMethod, type RpcContext } from '../../../core'
import { requireInstalledStructuredHost } from '../creation/structured-agent-session-gate'

/** The chat and its provider conversation, where the host can tell a terminal writes the same one. */
async function handoverChat(sessionId: string, ctx: RpcContext) {
  const host = await requireInstalledStructuredHost(ctx, sessionId)
  const record = host.deps.store.getRecord(sessionId)
  const head = record?.providerHandleChain.at(-1)
  const key = record && head ? recordConversationKey(record, head) : null
  return record &&
    key?.id &&
    adoptsCliConversations(record.provider) &&
    !agentForksThroughChat(record.provider) &&
    isNativeLocalLocation(record.location) &&
    // A bot keeps answering its mail and Slack here; a terminal takes a copy instead.
    botOfSession(ctx.runtime.bots, sessionId, host) === null
    ? { host, record, conversationId: key.id }
    : null
}

async function beginHandover(
  chat: NonNullable<Awaited<ReturnType<typeof handoverChat>>>,
  token: string,
  ctx: RpcContext
): Promise<AgentSessionTerminalHandoverResult> {
  const { host, record, conversationId } = chat
  const { sessionId } = record
  const open = (): AgentSessionTerminalHandoverResult => {
    const paneKey = structuredChatTerminalHold(sessionId)?.paneKey
    return { outcome: 'open', ...(paneKey ? { paneKey } : {}) }
  }
  if (
    structuredChatTerminalHold(sessionId) ||
    (await ctx.runtime.structuredChatHeldByTerminal(record))
  ) {
    return open()
  }
  // Another client may have begun during that check.
  if (structuredChatTerminalHold(sessionId)) {
    return open()
  }
  // A start already past its writer check would publish beside the terminal.
  if (host.sessionStarting(sessionId)) {
    return { outcome: 'busy' }
  }
  // Held first, so a message landing during the stop cannot start the agent again.
  beginStructuredChatTerminalHold(sessionId, token, conversationId)
  try {
    await host.releaseIdleSession(sessionId, true)
  } catch (error) {
    releaseStructuredChatTerminalHold(sessionId, token)
    throw error
  }
  if (host.loadedSessionIds().includes(sessionId) || host.sessionStarting(sessionId)) {
    releaseStructuredChatTerminalHold(sessionId, token)
    return { outcome: 'busy' }
  }
  ctx.runtime.watchStructuredChatTerminalHolds()
  return { outcome: 'held' }
}

export const STRUCTURED_AGENT_SESSION_TERMINAL_HANDOVER_METHODS = [
  defineMethod({
    name: 'agentSession.terminalHandover',
    permission: 'workspace',
    params: AgentSessionTerminalHandoverParams,
    handler: async (
      { sessionId, action, paneKey, token },
      ctx
    ): Promise<AgentSessionTerminalHandoverResult> => {
      const chat = await handoverChat(sessionId, ctx)
      if (!chat) {
        return { outcome: 'unsupported' }
      }
      const { host, record } = chat
      switch (action) {
        case 'begin':
          return token ? beginHandover(chat, token, ctx) : { outcome: 'unsupported' }
        case 'bind':
          if (token && paneKey) {
            bindStructuredChatTerminalHold(sessionId, token, paneKey)
          }
          return { outcome: 'held' }
        case 'abandon':
          // Nothing was launched; the chat stays at rest until someone writes.
          if (token) {
            releaseStructuredChatTerminalHold(sessionId, token)
          }
          return { outcome: 'free' }
        case 'status': {
          ctx.runtime.watchStructuredChatTerminalHolds()
          const hold = structuredChatTerminalHold(sessionId)
          return hold
            ? { outcome: 'held', ...(hold.paneKey ? { paneKey: hold.paneKey } : {}) }
            : { outcome: 'free' }
        }
        case 'end':
          if (!(await ctx.runtime.takeBackStructuredChat(record))) {
            return { outcome: 'open' }
          }
          // Starting reads in what the terminal wrote; a start that fails says so in the chat.
          await host.startSessionAgent(sessionId)
          return { outcome: 'back' }
      }
    }
  })
]
