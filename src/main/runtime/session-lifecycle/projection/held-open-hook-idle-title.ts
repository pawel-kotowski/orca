import { agentStatusStaleAfterMs } from '../../../../shared/agent-status/contracts/agent-status-freshness'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import { isAgentStatusHeldOpenByChildWork } from '../../../../shared/agent-status/lifecycle/agent-lead-status-fold'

/**
 * A row held open by the agent's own work (its lead done, a background shell, Monitor or subagent
 * still running) agrees with the idle title: the title shows only the lead. So the title, painted
 * just after the Stop hook that reported the work, never retires it; the agent exiting to its
 * shell does, and so does a newer hook (Paweł, 2026-11-16: a box agent waiting on a 13-day
 * simulation published `done` while `orca worktree ps` said monitoring).
 */
export function heldOpenHookOwnsIdleTitle(
  status: Pick<AgentStatusEntry, 'state' | 'mainAgent' | 'restoredUnconfirmed' | 'workingMode'>,
  observedAt: number
): boolean {
  return (
    status.restoredUnconfirmed !== true &&
    isAgentStatusHeldOpenByChildWork(status) &&
    Date.now() - observedAt <= agentStatusStaleAfterMs(status)
  )
}
