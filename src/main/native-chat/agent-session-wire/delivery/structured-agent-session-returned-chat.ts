import type { AgentSessionRecordStore } from '../../../runtime/agent-session/records/agent-session-record-store'
import type { StructuredAgentSessionHostSession } from '../host/structured-agent-session-host-types'
import { structuredAgentSessionConversationFence } from '../host/structured-agent-session-provider-child'
import { liftStructuredQueueRestartHold } from './structured-agent-session-queued-pause'

/**
 * Local: a terminal gave a chat back. Everything that came for it meanwhile waited as cards; an Orca
 * restart paused them too, and that pause ends with the hold. A pause the person made (Stop, closing
 * the chat, Sleep) stays.
 */
export async function wakeReturnedStructuredChat(
  store: AgentSessionRecordStore,
  sessionId: string,
  hold: { outlivedRestart: boolean; ran: boolean },
  host: {
    open: (sessionId: string) => Promise<Pick<StructuredAgentSessionHostSession, 'journal'>>
    shown: () => boolean
    /** The conversation moved on in the terminal, so a Continue waiting for a limit is the past's. */
    cancelUsageLimitContinue: () => Promise<void>
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
  if (hold.outlivedRestart && record.sleptAt === undefined && host.shown()) {
    await liftStructuredQueueRestartHold(
      journal,
      structuredAgentSessionConversationFence(store, sessionId)
    )
  }
  host.refresh()
  host.wakeDelivery()
}
