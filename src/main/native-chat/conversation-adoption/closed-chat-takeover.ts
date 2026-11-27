// `orca agent launch --resume <id>` of a conversation a closed chat holds: the new chat takes it over
// under the same session id, so Claude's cached prefix still matches, and the closed chat keeps its
// history only. Never an open or running chat, never one on another machine, one takeover at a time.
import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import type { StructuredAgentId } from '../../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle'
import { isAgentSessionHandover } from '../../../shared/agent-session/lifecycle/agent-session-handover'
import { isNativeLocalLocation } from '../../../shared/execution-host/execution-host'
import { AgentSessionPreSpawnError } from '../agent-session-wire/providers/structured-agent-session-adapter-errors'
import { getStructuredAgentSessionHost } from '../agent-session-wire/host/structured-agent-session-registry'
import {
  chatScratchInheritance,
  type ChatScratchInheritance
} from '../launch-profiles/chat-scratch-inheritance'

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

type HandCommand =
  | { kind: 'hand-over'; to: string; name: string; now: number }
  | { kind: 'hand-back'; from: string; name: string | null; now: number }

export type ClosedChatTakeoverHost = {
  deps: {
    store: {
      listConversations: () => readonly Pick<
        AgentSessionRecord,
        'sessionId' | 'provider' | 'providerHandleChain' | 'handedOverTo'
      >[]
      getRecord: (sessionId: string) => AgentSessionRecord | null
      isSessionTabVisible?: (sessionId: string) => boolean
      updateRecord: (sessionId: string, command: HandCommand) => Promise<unknown>
    }
  }
  serialize: <T>(sessionId: string, run: () => Promise<T>) => Promise<T>
  childAccountHome: (sessionId: string) => unknown
  sessionStarting: (sessionId: string) => boolean
}

export type ScratchInheritance = Pick<ChatScratchInheritance, 'set' | 'delete' | 'source'>

/** Takeovers whose new chat is still being created, by provider conversation. */
const inFlight = new Map<string, string>()

/** The chat that holds `providerSessionId` now: its head is that conversation, and it handed it to
 *  nobody, or to a chat a takeover of this run never finished (a crash between the two writes). */
function holderOf(
  host: ClosedChatTakeoverHost,
  agent: StructuredAgentId,
  providerSessionId: string
): string | null {
  for (const record of host.deps.store.listConversations()) {
    const head = record.providerHandleChain.at(-1)
    if (record.provider !== agent || head?.handle.nativeId !== providerSessionId) {
      continue
    }
    const to = isAgentSessionHandover(record.handedOverTo) ? record.handedOverTo.sessionId : null
    if (!to || (!host.deps.store.getRecord(to) && inFlight.get(providerSessionId) !== to)) {
      return record.sessionId
    }
  }
  return null
}

/** The closed, idle chat on this machine that holds `providerSessionId` hands it to
 *  `selfSessionId`, checked and written under that chat's own lock. The answer undoes it, for a
 *  create that then failed; nothing to undo when no chat held it. */
export async function takeOverClosedChatConversation(
  host: ClosedChatTakeoverHost,
  input: { agent: StructuredAgentId; providerSessionId: string; selfSessionId: string },
  scratch: ScratchInheritance = chatScratchInheritance()
): Promise<{ undo: () => Promise<void>; done: () => void }> {
  const nothing = { undo: async () => {}, done: () => {} }
  const ownerId = holderOf(host, input.agent, input.providerSessionId)
  if (!ownerId) {
    return nothing
  }
  return host.serialize(ownerId, async () => {
    const other = inFlight.get(input.providerSessionId)
    if (other && other !== input.selfSessionId) {
      throw new Error(
        'agent_session_conflict: cannot resume the conversation here: another chat is taking it over now.'
      )
    }
    // Read again under the lock: a reopen or a send in between would make it a second writer.
    const record = host.deps.store.getRecord(ownerId)
    if (!record || holderOf(host, input.agent, input.providerSessionId) !== ownerId) {
      return nothing
    }
    const refusal = closedChatTakeoverRefusal({
      local: isNativeLocalLocation(record.location),
      tabOpen: host.deps.store.isSessionTabVisible?.(ownerId) ?? true,
      agentRunning:
        host.childAccountHome(ownerId) !== undefined ||
        host.sessionStarting(ownerId) ||
        record.lease.claimStatus === 'live'
    })
    if (refusal) {
      throw new Error(`agent_session_conflict: cannot resume the conversation here: ${refusal}.`)
    }
    const previousName = record.conversationName ?? null
    inFlight.set(input.providerSessionId, input.selfSessionId)
    await host.deps.store.updateRecord(ownerId, {
      kind: 'hand-over',
      to: input.selfSessionId,
      // Session History says where it went on.
      name: `${previousName ?? 'Chat'} (went on in a new chat)`,
      now: Date.now()
    })
    scratch.set(input.selfSessionId, scratch.source(ownerId))
    const settle = () => {
      if (inFlight.get(input.providerSessionId) === input.selfSessionId) {
        inFlight.delete(input.providerSessionId)
      }
    }
    return {
      done: settle,
      undo: () =>
        host.serialize(ownerId, async () => {
          await host.deps.store.updateRecord(ownerId, {
            kind: 'hand-back',
            from: input.selfSessionId,
            name: previousName,
            now: Date.now()
          })
          scratch.delete(input.selfSessionId)
          settle()
        })
    }
  })
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

/** A chat's scratch folder: the one of the chat whose conversation it took over, if any. */
export function chatScratchSessionId(sessionId: string): string {
  return chatScratchInheritance().source(sessionId)
}

/** `resumeFrom.takeOverClosedChat`: the create takes the conversation from a closed chat first,
 *  under the same session id, so Claude's cached prefix still matches. Only a chat on this
 *  machine takes one over. */
export async function takeOverClosedChatIfAsked(input: {
  agent: StructuredAgentId
  resumeFrom: { providerSessionId: string; takeOverClosedChat?: true }
  envelope: { sessionId: string }
  local: boolean
}): Promise<{ undo: () => Promise<void>; done: () => void }> {
  const host = getStructuredAgentSessionHost()
  if (!input.resumeFrom.takeOverClosedChat || !host) {
    return { undo: async () => {}, done: () => {} }
  }
  if (!input.local) {
    throw new Error(
      'agent_session_conflict: only a chat on this machine takes a conversation over.'
    )
  }
  return takeOverClosedChatConversation(host, {
    agent: input.agent,
    providerSessionId: input.resumeFrom.providerSessionId,
    selfSessionId: input.envelope.sessionId
  })
}
