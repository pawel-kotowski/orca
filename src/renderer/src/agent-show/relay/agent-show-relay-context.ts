import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

/**
 * The context to show a server's relayed request with in this window, or null when this window
 * does not show that workspace for that server (the server then asks another desktop).
 */
export function relayedShowContext(
  environmentId: string,
  context: AgentShowContext,
  facts: {
    /** Where this window sends the workspace's file and git calls; null when it does not know it. */
    ownerTarget: RuntimeClientTarget | null
    tabs: readonly { id: string; entityId?: string }[] | undefined
  }
): AgentShowContext | null {
  const target = facts.ownerTarget
  if (target?.kind !== 'environment' || target.environmentId !== environmentId) {
    return null
  }
  const ownerTabId = context.ownerTabId
  // Why: an owner tab this window has not seen would read as closed and clear the show at once.
  const ownerKnown = Boolean(
    ownerTabId &&
    (facts.tabs ?? []).some((tab) => tab.id === ownerTabId || tab.entityId === ownerTabId)
  )
  return ownerKnown ? context : { ...context, ownerTabId: null }
}
