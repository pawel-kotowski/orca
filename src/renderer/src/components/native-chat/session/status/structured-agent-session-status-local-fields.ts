import type { AgentSessionStatusSummary } from '../../../../../../shared/agent-session/agent-session-wire'
import { normalizeAgentReachOutField } from '../../../../../../shared/agent-status/contracts/agent-reach-out'
import type {
  AgentStatusEntry,
  AgentStatusState
} from '../../../../../../shared/agent-status/contracts/agent-status-types'

type LocalPayload = Pick<AgentStatusEntry, 'reachOut' | 'compactedAt'>

/** What a terminal's hook row says besides its state, from the chat's summary. */
export function structuredStatusLocalPayload(
  state: AgentStatusState,
  summary: Pick<AgentSessionStatusSummary, 'reachOut' | 'compactedAt'>
): LocalPayload {
  const reachOut = normalizeAgentReachOutField(summary.reachOut)
  return {
    ...(reachOut ? { reachOut } : {}),
    ...(state === 'done' && typeof summary.compactedAt === 'number'
      ? { compactedAt: summary.compactedAt }
      : {})
  }
}

export function structuredStatusLocalFieldsMatch(
  current: Pick<AgentStatusEntry, 'reachOut' | 'compactedAt' | 'turnStartedAt'>,
  desired: LocalPayload,
  summary: Pick<AgentSessionStatusSummary, 'turnStartedAt'>
): boolean {
  return (
    // A row keeps the last reach-out and turn start it was told about.
    (desired.reachOut === undefined || current.reachOut?.at === desired.reachOut.at) &&
    current.compactedAt === desired.compactedAt &&
    (summary.turnStartedAt === undefined || current.turnStartedAt === summary.turnStartedAt)
  )
}
