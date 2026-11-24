import type { AgentJournalRenderItem } from '../journal/agent-session-journal-types'
import { isRootAgentJournalItem } from '../journal/agent-session-journal-producer'
import {
  readAgentJournalTurn,
  readAgentJournalTurnOutcome
} from '../lifecycle/records/agent-session-turn-record'
import type { AgentSessionStatusSummary } from '../agent-session-wire'

/** The clocks a terminal's hook row carries and a chat's status otherwise lacks. */
export type StructuredAgentSessionLocalClocks = Pick<
  AgentSessionStatusSummary,
  'turnStartedAt' | 'compactedAt'
>

export function newestRootTurn(
  items: readonly AgentJournalRenderItem[]
): AgentJournalRenderItem | undefined {
  return items.findLast((item) => isRootAgentJournalItem(item) && readAgentJournalTurn(item.body))
}

/** A woken agent's own turn opens no user message, so it never reads as a new prompt. */
export function structuredAgentSessionLocalClocks(
  userItem: Pick<AgentJournalRenderItem, 'observedAt'> | null | undefined,
  newestTurn: AgentJournalRenderItem | undefined
): StructuredAgentSessionLocalClocks {
  const turn = readAgentJournalTurn(newestTurn?.body)
  const compacted =
    turn?.turnId.startsWith('compact:') === true &&
    turn.state === 'completed' &&
    readAgentJournalTurnOutcome(turn) === 'success'
  const compactedAt = compacted ? (turn.completedAt ?? newestTurn?.observedAt) : undefined
  return {
    ...(userItem ? { turnStartedAt: userItem.observedAt } : {}),
    ...(compactedAt !== undefined ? { compactedAt } : {})
  }
}
