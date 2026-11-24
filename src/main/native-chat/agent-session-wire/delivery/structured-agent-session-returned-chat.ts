import type { AgentSessionRecordStore } from '../../../runtime/agent-session/records/agent-session-record-store'
import type { StructuredAgentSessionHostSession } from '../host/structured-agent-session-host-types'
import { structuredAgentSessionConversationFence } from '../host/structured-agent-session-provider-child'
import { liftStructuredQueueRestartHold } from './structured-agent-session-queued-pause'

/**
 * Local: a terminal gave a chat back. Everything that came for it meanwhile waited as cards; a
 * restart paused them too, and that pause ends with the hold. A person's own Stop keeps its pause.
 */
export async function wakeReturnedStructuredChat(
  store: AgentSessionRecordStore,
  sessionId: string,
  host: {
    open: (sessionId: string) => Promise<Pick<StructuredAgentSessionHostSession, 'journal'>>
    refresh: () => void
    wakeDelivery: () => void
  }
): Promise<void> {
  if (store.getRecord(sessionId) === null) {
    return
  }
  const { journal } = await host.open(sessionId)
  await liftStructuredQueueRestartHold(
    journal,
    structuredAgentSessionConversationFence(store, sessionId)
  )
  host.refresh()
  host.wakeDelivery()
}
