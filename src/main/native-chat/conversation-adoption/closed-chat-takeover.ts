// `orca agent launch --resume <id>` of a conversation a closed chat holds: the new chat takes it over
// under the same session id, so Claude's cached prefix still matches, and the closed chat keeps its
// history only. Never an open or running chat, never one on another machine.
import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import type { StructuredAgentId } from '../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { isAgentSessionHandover } from '../../../shared/agent-session/lifecycle/agent-session-handover'
import { isNativeLocalLocation } from '../../../shared/execution-host/execution-host'
import { listStructuredProviderSessionOwnership } from '../agent-session-wire/host/structured-provider-session-ownership'
import { findConflictingStructuredAdoption } from './structured-agent-session-history-adoption'
import { AgentSessionPreSpawnError } from '../agent-session-wire/providers/structured-agent-session-adapter-errors'
import { getStructuredAgentSessionHost } from '../agent-session-wire/host/structured-agent-session-registry'

export type TakeoverOwnerFacts = {
  local: boolean
  tabOpen: boolean
  agentRunning: boolean
}

/** Why the chat holding the conversation cannot hand it over, or null when it can. */
export function closedChatTakeoverRefusal(owner: TakeoverOwnerFacts): string | null {
  if (!owner.local) {
    return 'the chat that holds it runs on another machine'
  }
  if (owner.tabOpen) {
    return 'the chat that holds it is open'
  }
  if (owner.agentRunning) {
    return 'the chat that holds it is still running'
  }
  return null
}

export type ClosedChatTakeoverHost = {
  deps: {
    store: {
      listConversations: () => Parameters<typeof listStructuredProviderSessionOwnership>[0]
      getRecord: (sessionId: string) => AgentSessionRecord | null
      isSessionTabVisible?: (sessionId: string) => boolean
      updateRecord: (
        sessionId: string,
        command: { kind: 'hand-over'; to: string; now: number }
      ) => Promise<unknown>
      setConversationName: (sessionId: string, name: string | null) => Promise<unknown>
    }
  }
  childAccountHome: (sessionId: string) => unknown
  sessionStarting: (sessionId: string) => boolean
}

/** The closed, idle chat on this machine that holds `providerSessionId` hands it to `selfSessionId`:
 *  true when it did, false when no chat holds it; throws when the one that holds it cannot. */
export async function takeOverClosedChatConversation(
  host: ClosedChatTakeoverHost,
  input: { agent: StructuredAgentId; providerSessionId: string; selfSessionId: string }
): Promise<boolean> {
  const owner = findConflictingStructuredAdoption({
    ...input,
    ownership: listStructuredProviderSessionOwnership(host.deps.store.listConversations())
  })
  const record = owner ? host.deps.store.getRecord(owner.sessionId) : null
  if (!owner || !record) {
    return false
  }
  const refusal = closedChatTakeoverRefusal({
    local: isNativeLocalLocation(record.location),
    tabOpen: host.deps.store.isSessionTabVisible?.(owner.sessionId) ?? true,
    agentRunning:
      host.childAccountHome(owner.sessionId) !== undefined ||
      host.sessionStarting(owner.sessionId) ||
      record.lease.claimStatus === 'live'
  })
  if (refusal) {
    throw new Error(`agent_session_conflict: cannot resume the conversation here: ${refusal}.`)
  }
  await host.deps.store.updateRecord(owner.sessionId, {
    kind: 'hand-over',
    to: input.selfSessionId,
    now: Date.now()
  })
  // Session History says where it went on.
  await host.deps.store
    .setConversationName(
      owner.sessionId,
      `${record.conversationName ?? 'Chat'} (went on in a new chat)`
    )
    .catch(() => {})
  return true
}

/** The chat whose scratch folder a chat keeps: the first one of the conversations handed to it. */
export function scratchSessionFor(
  sessionId: string,
  records: readonly Pick<AgentSessionRecord, 'sessionId' | 'handedOverTo'>[]
): string {
  const from = new Map(
    records.flatMap((record) =>
      isAgentSessionHandover(record.handedOverTo)
        ? [[record.handedOverTo.sessionId, record.sessionId] as const]
        : []
    )
  )
  const seen = new Set<string>()
  let current = sessionId
  while (from.has(current) && !seen.has(current)) {
    seen.add(current)
    current = from.get(current)!
  }
  return current
}

/** A chat that handed its conversation on never starts its agent again: a second writer of it. */
export function refuseHandedOverChatStart(
  record: Pick<AgentSessionRecord, 'handedOverTo'>,
  nameOf: (sessionId: string) => string | undefined
): void {
  if (isAgentSessionHandover(record.handedOverTo)) {
    const name = nameOf(record.handedOverTo.sessionId)
    throw new AgentSessionPreSpawnError(
      new Error(
        `This conversation went on in another chat${name ? ` ("${name}")` : ''}: continue it there.`
      )
    )
  }
}

/** A chat's scratch folder: the one of the chat that handed it its conversation, if any. */
export function chatScratchSessionId(sessionId: string): string {
  const store = getStructuredAgentSessionHost()?.deps.store
  return scratchSessionFor(sessionId, store?.listRecords?.() ?? [])
}

/** `resumeFrom.takeOverClosedChat`: the create takes the conversation from a closed chat first,
 *  under the same session id, so Claude's cached prefix still matches. */
export async function takeOverClosedChatIfAsked(input: {
  agent: StructuredAgentId
  resumeFrom: { providerSessionId: string; takeOverClosedChat?: true }
  envelope: { sessionId: string }
}): Promise<void> {
  const host = getStructuredAgentSessionHost()
  if (input.resumeFrom.takeOverClosedChat && host) {
    await takeOverClosedChatConversation(host, {
      agent: input.agent,
      providerSessionId: input.resumeFrom.providerSessionId,
      selfSessionId: input.envelope.sessionId
    })
  }
}
