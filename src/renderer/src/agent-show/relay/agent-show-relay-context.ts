import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import type { RuntimeClientTarget } from '../../../../shared/runtime-client-target'

/**
 * The context to show a server's relayed request with in this window, or null when this window
 * does not show that workspace for that server (the server then asks another desktop).
 *
 * The owner stays the box agent's own tab id, never translated or dropped: every owner check in
 * this window matches it to the tab's mirror (isShowOwnerTab), and one id for every request keeps
 * each box agent's tour and marks its own even before (or without) its tab reaching this window.
 */
export function relayedShowContext(
  environmentId: string,
  context: AgentShowContext,
  ownerTarget: RuntimeClientTarget | null
): AgentShowContext | null {
  return ownerTarget?.kind === 'environment' && ownerTarget.environmentId === environmentId
    ? context
    : null
}
