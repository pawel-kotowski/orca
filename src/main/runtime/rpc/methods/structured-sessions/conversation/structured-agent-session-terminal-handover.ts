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
  endStructuredChatTerminalHold
} from '../../../../agent-session/ownership/structured-chat-terminal-holds'
import { isAgentSessionRefusalError } from '../../../../../../shared/agent-session/failures/agent-session-wire-refusals'
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

export const STRUCTURED_AGENT_SESSION_TERMINAL_HANDOVER_METHODS = [
  defineMethod({
    name: 'agentSession.terminalHandover',
    permission: 'workspace',
    params: AgentSessionTerminalHandoverParams,
    handler: async (
      { sessionId, action, paneKey },
      ctx
    ): Promise<AgentSessionTerminalHandoverResult> => {
      const chat = await handoverChat(sessionId, ctx)
      if (!chat) {
        return { outcome: 'unsupported' }
      }
      const { host, record, conversationId } = chat
      if (action === 'begin') {
        // Held first, so a message landing during the stop cannot start the agent again.
        beginStructuredChatTerminalHold(sessionId, Date.now())
        try {
          await host.releaseIdleSession(sessionId, true)
        } catch (error) {
          endStructuredChatTerminalHold(sessionId)
          throw error
        }
        if (host.loadedSessionIds().includes(sessionId)) {
          endStructuredChatTerminalHold(sessionId)
          return { outcome: 'busy' }
        }
        return { outcome: 'held' }
      }
      if (action === 'bind') {
        if (paneKey) {
          bindStructuredChatTerminalHold(sessionId, paneKey)
        }
        return { outcome: 'held' }
      }
      endStructuredChatTerminalHold(sessionId)
      try {
        await ctx.runtime.assertStructuredAdoptionTerminalWritersExited(
          record.provider,
          conversationId
        )
      } catch (error) {
        if (isAgentSessionRefusalError(error)) {
          return { outcome: 'open' }
        }
        throw error
      }
      // Starting reads in what the terminal wrote; a start that fails says so in the chat itself.
      await host.startSessionAgent(sessionId)
      return { outcome: 'back' }
    }
  })
]
