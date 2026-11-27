// `orca chat send|compact|stop|show|login`: a program drives a chat the way a person does in its tab.
import { agentSessionProviderHandleChainHead } from '../../../../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { agentSessionAccountHomePath } from '../../../../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import { structuredAgentSessionPayloadFingerprint } from '../../../../../../shared/agent-session/lifecycle/operations/structured-agent-session-mutation'
import {
  AgentSessionChatControlParams,
  AgentSessionSendTextParams,
  AgentSessionSetLaunchProfileParams
} from '../../../../../../shared/rpc-contract/structured-agent-session/structured-agent-session-chat-control-params'
import { chatLaunchProfiles } from '../../../../../native-chat/launch-profiles/chat-launch-profiles'
import type { StructuredAgentSessionHost } from '../../../../../native-chat/agent-session-wire/host/structured-agent-session-host'
import { mintAgentSessionOperationId } from '../../../../orchestration/mailbox/structured-pointer/structured-pointer-operation-id'
import { sendAgentTurn } from '../../../../orchestration/turn-delivery/send-agent-turn'
import { defineMethod, type RpcContext } from '../../../core'
import { resolveStructuredWorkerIdentity } from '../../../../orchestration/terminal-authority/structured-sessions/structured-worker-authority'
import { claudeChatProfileArgsRefusal } from '../../../../../claude/structured/launch/claude-chat-launch-profile'
import {
  requireInstalledStructuredHost,
  structuredCallerFor
} from '../creation/structured-agent-session-gate'
import { agentSessionConversationCommandFields } from '../../../../../../shared/agent-session/conversation-context/agent-session-conversation-command'

function envelope(
  host: StructuredAgentSessionHost,
  sessionId: string,
  method: string,
  fields: Record<string, unknown>
) {
  return {
    sessionId,
    clientOperationId: mintAgentSessionOperationId(Date.now()),
    expectedRuntimeFence: host.deps.store.requireWritableRecord(sessionId).lease.runtimeFence,
    payloadFingerprint: structuredAgentSessionPayloadFingerprint({
      method,
      sessionId,
      fields
    })
  }
}

/** The chat a `--session` or a chat worker's `--worker` handle names: the worker's current session. */
function chatOf(params: { sessionId?: string; worker?: string }, ctx: RpcContext): string {
  if (params.sessionId) {
    return params.sessionId
  }
  const identity = resolveStructuredWorkerIdentity(
    params.worker ?? '',
    ctx.runtime.getOrchestrationDb()
  )
  if (!identity) {
    throw new Error(`agent_session_identity_required: no chat worker ${params.worker}`)
  }
  return identity.sessionId
}

function refusedMessage(refusal: { code: string; message?: string }): string {
  return refusal.message ? `${refusal.code}: ${refusal.message}` : refusal.code
}

export type ChatLaunchFacts = {
  /** Its agent is in a turn; `idle` waits for a message; `stopped` has no agent running. */
  state: 'working' | 'idle' | 'stopped'
  /** Work its agent still holds open besides a turn: background commands, subagents, queued sends. */
  openWork: boolean
  /** Its latest turn ended at the login's usage limit. */
  usageLimit: { resetsAt: number | null } | null
  /** The login its agent runs on now, else the one its next start takes. */
  claudeConfigDir: string | null
  /** The provider conversation (Claude: its session id), once it has one. */
  providerSessionId: string | null
  /** The names (not values) of the variables its launch profile adds: who launched it can tell its own. */
  launchEnv: string[]
}

export const STRUCTURED_AGENT_SESSION_CHAT_CONTROL_METHODS = [
  defineMethod({
    name: 'agentSession.sendText',
    permission: 'workspace',
    params: AgentSessionSendTextParams,
    handler: async (params, ctx) => {
      const { text, queue } = params
      const sessionId = chatOf(params, ctx)
      const host = await requireInstalledStructuredHost(ctx, sessionId)
      const outcome = await sendAgentTurn({
        kind: 'structured-session',
        host,
        sessionId,
        callerKey: structuredCallerFor(ctx).callerKey,
        turn: {
          body: {
            kind: 'message',
            role: 'user',
            blocks: [{ type: 'text', text }]
          },
          delivery: queue ? 'queue' : 'now',
          operationId: mintAgentSessionOperationId(Date.now()),
          expectedRuntimeFence: host.deps.store.requireWritableRecord(sessionId).lease.runtimeFence
        }
      })
      if (outcome.kind === 'refused') {
        throw new Error(refusedMessage(outcome.refusal))
      }
      return {
        outcome: outcome.kind,
        clientMessageId: outcome.clientMessageId
      }
    }
  }),
  defineMethod({
    name: 'agentSession.compactNow',
    permission: 'workspace',
    params: AgentSessionChatControlParams,
    handler: async (params, ctx) => {
      const sessionId = chatOf(params, ctx)
      const host = await requireInstalledStructuredHost(ctx, sessionId)
      const delivery = 'queue-if-active' as const
      const result = await host.conversationCommand(structuredCallerFor(ctx), {
        command: 'compact',
        delivery,
        envelope: envelope(
          host,
          sessionId,
          'agentSession.conversationCommand',
          agentSessionConversationCommandFields('compact', { delivery })
        )
      })
      if (!result.ok) {
        throw new Error(refusedMessage(result.refusal))
      }
      return { state: result.value.state }
    }
  }),
  defineMethod({
    name: 'agentSession.stopTurn',
    permission: 'workspace',
    params: AgentSessionChatControlParams,
    handler: async (params, ctx) => {
      const sessionId = chatOf(params, ctx)
      const host = await requireInstalledStructuredHost(ctx, sessionId)
      const result = await host.cancel(structuredCallerFor(ctx), {
        envelope: envelope(host, sessionId, 'agentSession.cancel', {})
      })
      if (!result.ok) {
        throw new Error(refusedMessage(result.refusal))
      }
      return { stopped: true }
    }
  }),
  defineMethod({
    name: 'agentSession.launchFacts',
    permission: 'workspace',
    params: AgentSessionChatControlParams,
    handler: async (params, ctx): Promise<ChatLaunchFacts> => {
      const sessionId = chatOf(params, ctx)
      const host = await requireInstalledStructuredHost(ctx, sessionId, true)
      const record = host.deps.store.getRecord(sessionId)
      if (!record) {
        throw new Error('agent_session_identity_required: no chat with this session id')
      }
      const running = host.childAccountHome(sessionId)
      const working = running !== undefined && record.lastTurn?.state === 'open'
      const openWork = running !== undefined && (await host.sessionOwesWork(sessionId))
      const cut = await (await host.journalReads(sessionId)).usageLimitCut().catch(() => null)
      const limited =
        cut && (!record.lastTurn?.at || (cut.turnEndedAt ?? 0) >= record.lastTurn.at - 1000)
      const head = agentSessionProviderHandleChainHead(record.providerHandleChain)
      return {
        state: running === undefined ? 'stopped' : working ? 'working' : 'idle',
        openWork,
        usageLimit: limited && !working ? { resetsAt: cut.resetsAt ?? null } : null,
        claudeConfigDir:
          agentSessionAccountHomePath(running ?? null) ??
          chatLaunchProfiles().get(sessionId)?.claudeConfigDir ??
          agentSessionAccountHomePath(record.launchedAccount?.accountHome ?? record.accountHome),
        providerSessionId: head?.handle.nativeId ?? null,
        launchEnv: Object.keys(chatLaunchProfiles().get(sessionId)?.env ?? {})
      }
    }
  }),
  defineMethod({
    name: 'agentSession.setLaunchProfile',
    permission: 'workspace',
    params: AgentSessionSetLaunchProfileParams,
    handler: async (params, ctx) => {
      const { claudeConfigDir, profile } = params
      const sessionId = chatOf(params, ctx)
      const host = await requireInstalledStructuredHost(ctx, sessionId)
      if (!host.deps.store.getRecord(sessionId)) {
        throw new Error('agent_session_identity_required: no chat with this session id')
      }
      const profiles = chatLaunchProfiles()
      const next = {
        ...(profile ?? profiles.get(sessionId)),
        ...(claudeConfigDir ? { claudeConfigDir } : {})
      }
      const refusal = claudeChatProfileArgsRefusal(next.args ?? [])
      if (refusal) {
        throw new Error(`invalid_argument: ${refusal}`)
      }
      profiles.set(sessionId, next)
      if (host.childAccountHome(sessionId) === undefined) {
        return { outcome: 'next_start' as const }
      }
      if (await host.sessionOwesWork(sessionId)) {
        // A worker's open dispatch is owed work too; between its turns it can still move.
        return {
          outcome: (await host.stopAgentBetweenTurns(sessionId)) ? 'next_start' : 'after_work'
        } as const
      }
      // Its agent stops now; the next message starts it again, resumed, on the new login.
      await host.releaseIdleSession(sessionId, true)
      return { outcome: 'next_start' as const }
    }
  })
]
