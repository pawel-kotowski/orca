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
import {
  failureHoldsMail,
  queuePauseHolding,
  type DerivedQueuePause
} from '../../agent-session-journal/queued-messages/queued-message-pause'
import { structuredAgentSessionConversationFence } from '../host/structured-agent-session-provider-child'
import type { StructuredChatReturn } from '../../../runtime/agent-session/ownership/structured-chat-returns'
import { orchestrationMailNotice } from '../../../../shared/agent-session/journal/agent-session-message-source'
import {
  resumeStructuredQueue,
  structuredQueuePauses
} from './structured-agent-session-queued-pause'

/**
 * Local: a terminal gave a chat back. Without the hold, what came meanwhile would have gone at once; as
 * cards, a failed turn before it or an Orca restart holds them until the next turn. So the first of
 * them is sent, and is that turn. A restart's pause ends for a person's card only with a person's
 * turn, so it is looked at again when that turn is over. A chat the person closed or put to sleep
 * keeps its cards.
 */
export async function wakeReturnedStructuredChat(
  store: AgentSessionRecordStore,
  sessionId: string,
  hold: StructuredChatReturn,
  host: {
    open: (sessionId: string) => Promise<Pick<StructuredAgentSessionHostSession, 'journal'>>
    /** The conversation moved on in the terminal, so a Continue waiting for a limit is the past's. */
    cancelUsageLimitContinue: () => Promise<void>
    /** The workspace sleeps, or is being put to sleep. */
    asleep: (workspaceId: string) => boolean
    working: () => Promise<boolean>
    send: (messageId: string) => Promise<{ ok: boolean }>
    refresh: () => void
    wakeDelivery: () => void
  }
): Promise<'done' | 'sent' | 'later'> {
  const record = store.getRecord(sessionId)
  if (record === null) {
    return 'done'
  }
  const { journal } = await host.open(sessionId)
  if (hold.ran && !hold.sent) {
    await host.cancelUsageLimitContinue()
  }
  if (record.sleptAt !== undefined || host.asleep(record.location.workspaceId)) {
    return 'done'
  }
  // Its first message runs: the rest is looked at once that turn is over.
  if (hold.sent && (await host.working())) {
    return 'later'
  }
  let outcome: 'done' | 'sent' | 'later' = 'done'
  if (isUsageLimitChatOpen(store, sessionId)) {
    const pauses = await structuredQueuePauses(journal)
    const first = await firstWaiting(journal, hold, pauses)
    if (first !== undefined) {
      outcome = (await host.send(first)).ok ? 'sent' : 'later'
    } else if (
      // A turn that failed before the terminal went on is the past's too: it holds nothing more, and
      // no Continue is coming that would free the queue.
      hold.ran &&
      !hold.sent &&
      pauses.some(({ reason }) => reason === 'failed') &&
      pauses.every(({ reason }) => reason === 'failed' || reason === 'restarted')
    ) {
      await resumeStructuredQueue(
        journal,
        structuredAgentSessionConversationFence(store, sessionId)
      )
    }
  }
  host.refresh()
  host.wakeDelivery()
  return outcome
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
  { waiting, ran, sent }: StructuredChatReturn,
  pauses: readonly DerivedQueuePause[]
): Promise<string | undefined> {
  // A turn that failed since is the present's, and holds what is behind it as ever.
  const past = ({ reason }: DerivedQueuePause): boolean =>
    reason === 'restarted' || (reason === 'failed' && !sent)
  if (!pauses.some(past) || (sent && pauses.some(({ reason }) => reason === 'failed'))) {
    return undefined
  }
  const agentsWait = !ran && pauses.some(failureHoldsMail)
  for (const messageId of waiting) {
    const card = await journal.queuedMessages.get(messageId)
    const { from } = card?.body ?? {}
    // Mail is redriven by its own mailbox; what another agent sent waits out a usage limit, as ever,
    // unless the conversation went on in the terminal.
    if (
      card?.state === 'waiting' &&
      card.holdReason === null &&
      pauses.some((pause) => past(pause) && queuePauseHolding([pause], card) !== undefined) &&
      !orchestrationMailNotice(from) &&
      !(from && agentsWait)
    ) {
      return messageId
    }
  }
  return undefined
}
