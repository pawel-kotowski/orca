import type Database from '../../sqlite/sync-database'
import type { AgentJournalCursor } from '../../../shared/agent-session/journal/agent-session-journal-identity'
import type { journalDomainInputEligibility } from './journal-domain-input-eligibility'
import { readJournalDomainQueuePauseContext } from './journal-domain-queue-pauses'
import { readJournalSqlUsageLimitCut } from './journal-sql-status-cuts'
import type { JournalSqlScope } from './journal-sql-scope'

/**
 * Local: whether a turn nobody asked for (idle compaction) would touch nothing of the person's: none
 * runs or waits, no card waits, and neither a Stop, a failed turn nor a usage limit stands. Such a
 * turn's own success would end them.
 */
export function journalDomainChatAtRest(
  db: Database.Database,
  scope: JournalSqlScope,
  eligibility: ReturnType<typeof journalDomainInputEligibility>,
  reopenFloor: AgentJournalCursor | null
): boolean {
  return (
    eligibility.prompts.length === 0 &&
    eligibility.handover.length === 0 &&
    !eligibility.pending &&
    !eligibility.work.working() &&
    db
      .prepare(`SELECT 1 FROM journal_queue_cards WHERE session_id=? AND epoch=?
        AND state IN ('waiting','returned') LIMIT 1`)
      .get(...scope.prefix) === undefined &&
    // A clear or a restart holds cards alone, and there are none.
    readJournalDomainQueuePauseContext(db, scope, reopenFloor, []).pauses.every(
      ({ reason }) => reason === 'cleared' || reason === 'restarted'
    ) &&
    readJournalSqlUsageLimitCut(eligibility.context) === null
  )
}
