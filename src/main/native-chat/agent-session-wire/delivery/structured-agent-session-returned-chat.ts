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
import { structuredQueuePauses } from './structured-agent-session-queued-pause'

/**
 * Local: a terminal gave a chat back. Without the hold, what came meanwhile would have gone at once;
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
    send: (messageId: string) => Promise<unknown>
    refresh: () => void
    wakeDelivery: () => void
  }
): Promise<void> {
  const record = store.getRecord(sessionId)
  if (record === null) {
    return
  }
  const { journal } = await host.open(sessionId)
  if (hold.ran) {
    await host.cancelUsageLimitContinue()
  }
  if (record.sleptAt === undefined && isUsageLimitChatOpen(store, sessionId)) {
    const held = (await structuredQueuePauses(journal)).some(
      ({ reason }) => reason === 'failed' || reason === 'restarted'
    )
    const first = held ? await firstWaiting(journal, hold.waiting) : undefined
    if (first !== undefined) {
      await host.send(first)
    }
  }
  host.refresh()
  host.wakeDelivery()
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

async function firstWaiting(
  journal: StructuredAgentSessionHostSession['journal'],
  waiting: readonly string[]
): Promise<string | undefined> {
  for (const messageId of waiting) {
    const card = await journal.queuedMessages.get(messageId)
    // Another agent's mail keeps its own rule: it waits out a usage limit, hold or not.
    if (card?.state === 'waiting' && card.holdReason === null && !card.body.from) {
      return messageId
    }
  }
  return undefined
}
