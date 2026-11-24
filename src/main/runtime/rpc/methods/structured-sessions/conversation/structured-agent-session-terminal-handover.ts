import { randomUUID } from 'node:crypto'
import type { AgentSessionTerminalHandoverResult } from '../../../../../../shared/agent-session/lifecycle/operations/agent-session-terminal-handover'
import { AgentSessionTerminalHandoverParams } from '../../../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-terminal-handover-params'
import { agentForksThroughChat } from '../../../../../../shared/agent-launch/startup/agent-resume-argv'
import { adoptsCliConversations } from '../../../../../../shared/agent-session/view/structured-agent-cli-conversation-adoption'
import { isNativeLocalLocation } from '../../../../../../shared/execution-host/execution-host'
import { botOfSession } from '../../../../../bots/bot-session-tabs'
import { recordConversationKey } from '../../../../../native-chat/conversation-adoption/structured-conversation-key'
import {
  abandonStructuredChatTerminalHold,
  beginStructuredChatTerminalHold,
  forgetAbandonedStructuredChatTerminalHold,
  releaseStructuredChatTerminalHold,
  structuredChatTerminalHold,
  type StructuredChatTerminalHold
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

/** What clients are told of a hold: never its token. */
function heldAnswer(
  hold: StructuredChatTerminalHold
): Extract<AgentSessionTerminalHandoverResult, { outcome: 'held' }> {
  return {
    outcome: 'held',
    holdId: hold.id,
    ...(hold.paneKey ? { paneKey: hold.paneKey } : {}),
    ...(hold.phase === 'opening' ? { opening: true as const } : {})
  }
}

function openAnswer(sessionId: string): AgentSessionTerminalHandoverResult {
  const hold = structuredChatTerminalHold(sessionId)
  return hold ? { ...heldAnswer(hold), outcome: 'open' } : { outcome: 'open' }
}

async function beginHandover(
  chat: NonNullable<Awaited<ReturnType<typeof handoverChat>>>,
  token: string,
  ctx: RpcContext
): Promise<AgentSessionTerminalHandoverResult> {
  const { host, record, conversationId } = chat
  const { sessionId } = record
  if (
    structuredChatTerminalHold(sessionId) ||
    (await ctx.runtime.structuredChatRunsInTerminal(record)) ||
    // Another client may have begun during that check.
    structuredChatTerminalHold(sessionId)
  ) {
    return openAnswer(sessionId)
  }
  // A start already past its writer check would publish beside the terminal.
  if (host.sessionStarting(sessionId)) {
    return { outcome: 'busy' }
  }
  // Held first, so a message landing during the stop cannot start the agent again.
  const held = beginStructuredChatTerminalHold(sessionId, {
    token,
    id: randomUUID(),
    agent: record.provider,
    conversationId
  })
  if (!held) {
    return { outcome: 'free' }
  }
  ctx.runtime.watchStructuredChatTerminalHolds()
  const giveUp = (): boolean => releaseStructuredChatTerminalHold(sessionId, token)
  try {
    await host.releaseIdleSession(sessionId, true)
  } catch (error) {
    giveUp()
    throw error
  }
  if (host.loadedSessionIds().includes(sessionId) || host.sessionStarting(sessionId)) {
    giveUp()
    return { outcome: 'busy' }
  }
  const hold = structuredChatTerminalHold(sessionId)
  return hold?.token === token ? heldAnswer(hold) : { outcome: 'free' }
}

/** A client that goes away before its terminal was asked for can launch none: its hold ends. */
function releaseWithClient(sessionId: string, token: string, ctx: RpcContext): void {
  if (ctx.connectionId) {
    ctx.runtime.registerSubscriptionCleanup(
      `chat-terminal-handover:${token}`,
      () => abandonStructuredChatTerminalHold(sessionId, token),
      ctx.connectionId
    )
  }
}

export const STRUCTURED_AGENT_SESSION_TERMINAL_HANDOVER_METHODS = [
  defineMethod({
    name: 'agentSession.terminalHandover',
    permission: 'workspace',
    params: AgentSessionTerminalHandoverParams,
    handler: async (
      { sessionId, action, token, holdId },
      ctx
    ): Promise<AgentSessionTerminalHandoverResult> => {
      if (action === 'abandon') {
        // Before the chat is read: it may overtake its own `begin`.
        if (token) {
          abandonStructuredChatTerminalHold(sessionId, token)
        }
        return { outcome: 'free' }
      }
      const chat = await handoverChat(sessionId, ctx)
      if (!chat) {
        return { outcome: 'unsupported' }
      }
      const { host, record } = chat
      switch (action) {
        case 'begin':
          if (!token) {
            return { outcome: 'unsupported' }
          }
          releaseWithClient(sessionId, token, ctx)
          return beginHandover(chat, token, ctx).finally(() =>
            forgetAbandonedStructuredChatTerminalHold(token)
          )
        case 'status': {
          const hold = structuredChatTerminalHold(sessionId)
          return hold ? heldAnswer(hold) : { outcome: 'free' }
        }
        case 'end': {
          if (!(await ctx.runtime.takeBackStructuredChat(record, holdId))) {
            return openAnswer(sessionId)
          }
          if (structuredChatTerminalHold(sessionId)) {
            return { outcome: 'free' }
          }
          // Starting reads in what the terminal wrote; another failure says so in the chat.
          const started = await host.startSessionAgent(sessionId)
          return started.ok || started.refusal.code !== 'agent_session_conflict'
            ? { outcome: 'back' }
            : openAnswer(sessionId)
        }
      }
    }
  })
]
