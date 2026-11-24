import { randomUUID } from 'node:crypto'
import {
  createStructuredAgentSessionOperationId,
  structuredAgentSessionPayloadFingerprint
} from '../../../../shared/agent-session/lifecycle/operations/structured-agent-session-mutation'

import type { AgentSessionRecordStore } from '../../../runtime/agent-session/records/agent-session-record-store'
import type {
  StructuredAgentSessionHostDeps,
  StructuredAgentSessionHostSession
} from '../host/structured-agent-session-host-types'
import { isUsageLimitChatOpen } from '../recovery/structured-agent-session-usage-limit-disposition'
import { failureHoldsMail } from '../../agent-session-journal/queued-messages/queued-message-pause'
import { orchestrationMailNotice } from '../../../../shared/agent-session/journal/agent-session-message-source'
import { structuredQueuePauses } from './structured-agent-session-queued-pause'

/**
 * Local: a terminal gave a chat back; false to try again. Without the hold, what came meanwhile would have gone at once;
 * as cards, a failed turn before it or an Orca restart holds them until the next turn. So the first
 * of them is sent, and is that turn. A chat the person closed or put to sleep keeps its cards.
 */
export async function wakeReturnedStructuredChat(
  store: AgentSessionRecordStore,
  sessionId: string,
  hold: { waiting: readonly string[]; ran: boolean },
  host: {
    open: (sessionId: string) => Promise<Pick<StructuredAgentSessionHostSession, 'journal'>>
    /** The conversation moved on in the terminal, so a Continue waiting for a limit is the past's. */
    cancelUsageLimitContinue: () => Promise<void>
    /** The workspace sleeps, or is being put to sleep. */
    asleep: (workspaceId: string) => boolean
    send: (messageId: string) => Promise<{ ok: boolean }>
    refresh: () => void
    wakeDelivery: () => void
  }
): Promise<boolean> {
  const record = store.getRecord(sessionId)
  if (record === null) {
    return true
  }
  const { journal } = await host.open(sessionId)
  if (hold.ran) {
    await host.cancelUsageLimitContinue()
  }
  if (record.sleptAt !== undefined || host.asleep(record.location.workspaceId)) {
    return true
  }
  const first = isUsageLimitChatOpen(store, sessionId)
    ? await firstWaiting(journal, hold.waiting)
    : undefined
  const sent = first === undefined || (await host.send(first)).ok
  host.refresh()
  host.wakeDelivery()
  return sent
}

/** The host's own press of a card's Send. */
export function returnedChatSend(
  deps: Pick<StructuredAgentSessionHostDeps, 'store'>,
  sessionId: string,
  messageId: string
) {
  return [
    { callerKey: 'trusted-local:terminal-return' },
    {
      messageId,
      envelope: {
        sessionId,
        clientOperationId: createStructuredAgentSessionOperationId(randomUUID),
        expectedRuntimeFence: deps.store.getConversation(sessionId)?.currentFence ?? null,
        payloadFingerprint: structuredAgentSessionPayloadFingerprint({
          method: 'agentSession.queuedMessageSend',
          sessionId,
          fields: { messageId }
        })
      }
    }
  ] as const
}

/** The first card a pause would go on holding though the same message, sent now, would go. */
async function firstWaiting(
  journal: StructuredAgentSessionHostSession['journal'],
  waiting: readonly string[]
): Promise<string | undefined> {
  const pauses = await structuredQueuePauses(journal)
  if (!pauses.some(({ reason }) => reason === 'failed' || reason === 'restarted')) {
    return undefined
  }
  const agentsWait = pauses.some(failureHoldsMail)
  for (const messageId of waiting) {
    const card = await journal.queuedMessages.get(messageId)
    const { from } = card?.body ?? {}
    // Mail is redriven by its own mailbox; what another agent sent waits out a usage limit, as ever.
    if (
      card?.state === 'waiting' &&
      card.holdReason === null &&
      !orchestrationMailNotice(from) &&
      !(from && agentsWait)
    ) {
      return messageId
    }
  }
  return undefined
}
