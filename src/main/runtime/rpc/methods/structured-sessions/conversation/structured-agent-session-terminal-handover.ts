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
  chatTerminalHandoverSubscription,
  expectStructuredChatTerminalHold,
  releaseStructuredChatTerminalHold,
  structuredChatTerminalHold,
  type StructuredChatTerminalHold
} from '../../../../agent-session/ownership/structured-chat-terminal-holds'
import { structuredAgentSessionSendBlock } from '../../../../../native-chat/agent-session-wire/operations/structured-agent-session-send-preparation'
import { isQueuedAgentJournalSubmission } from '../../../../../../shared/agent-session/requests/agent-session-queued-submission'
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
  // The handover's own; others join after it.
  const paneKey = hold.terminals[0]?.paneKey
  return {
    outcome: 'held',
    holdId: hold.id,
    ...(paneKey ? { paneKey } : {}),
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
    (await ctx.runtime.structuredChatRunsInTerminal(record))
  ) {
    return openAnswer(sessionId)
  }
  // In the chat's lane: a delivery that saw no hold has registered its start by then. Held before the
  // stop, so a message landing during it cannot start the agent again.
  const refused = await host.serialize(
    sessionId,
    async (): Promise<AgentSessionTerminalHandoverResult | null> => {
      if (structuredChatTerminalHold(sessionId)) {
        return openAnswer(sessionId)
      }
      // A start already past its writer check would publish beside the terminal; a rewind in doubt
      // needs a start of its own before the next message.
      if (
        host.sessionStarting(sessionId) ||
        structuredAgentSessionSendBlock(host.deps.store.getRecord(sessionId))
      ) {
        return { outcome: 'busy' }
      }
      const held =
        ctx.signal?.aborted !== true &&
        beginStructuredChatTerminalHold(sessionId, {
          token,
          id: randomUUID(),
          agent: record.provider,
          conversationId
        })
      return held ? null : { outcome: 'free' }
    }
  )
  if (refused) {
    return refused
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
  // Accepted just before the hold and still to be handed over: that is work.
  const { submissions } = await (
    await host.journalReads(sessionId)
  ).input({ kind: 'recoverable-submissions' })
  if (submissions.some(isQueuedAgentJournalSubmission)) {
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
      chatTerminalHandoverSubscription(token),
      () => abandonStructuredChatTerminalHold(sessionId, token),
      ctx.connectionId
    )
  }
}

async function beginForClient(
  sessionId: string,
  token: string,
  ctx: RpcContext
): Promise<AgentSessionTerminalHandoverResult> {
  // Both before anything is waited for, so a client that goes meanwhile is noticed.
  const begun = expectStructuredChatTerminalHold(token)
  releaseWithClient(sessionId, token, ctx)
  try {
    const chat = await handoverChat(sessionId, ctx)
    return chat ? await beginHandover(chat, token, ctx) : { outcome: 'unsupported' }
  } finally {
    begun()
    if (structuredChatTerminalHold(sessionId)?.token !== token && ctx.connectionId) {
      ctx.runtime.cleanupSubscription(chatTerminalHandoverSubscription(token))
    }
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
      if (action === 'begin') {
        return token ? beginForClient(sessionId, token, ctx) : { outcome: 'unsupported' }
      }
      const chat = await handoverChat(sessionId, ctx)
      if (!chat) {
        return { outcome: 'unsupported' }
      }
      const { host, record } = chat
      switch (action) {
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
