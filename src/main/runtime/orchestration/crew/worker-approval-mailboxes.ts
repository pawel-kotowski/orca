import type { OrchestrationDb } from '../db/orchestration-db'
import { readCrewOwnedRunAddresses } from './crew-query'
import { parseOrcaSessionAddress } from '../../../../shared/orca-session-address'
import { isWorkerApprovalsTerminalParty } from '../../../../shared/orchestration/worker-approvals-party'

/** The mailboxes a chat coordinator's workers report their prompts to: its own address and its
 *  Runs'. A structured chat's Runs are bound to its Orca session; a terminal chat's to its handle
 *  (and its pane, so a Run outlives the terminal's restart). */
export function workerApprovalMailboxes(
  db: OrchestrationDb,
  party: string,
  paneForHandle: (handle: string) => string | null
): string[] {
  const orcaSessionId = parseOrcaSessionAddress(party)
  if (orcaSessionId) {
    return [
      party,
      ...db
        .runsBoundToCoordinator({ orcaSessionId, paneKey: null, terminalHandle: null })
        .map((run) => `run:${run.id}`)
    ]
  }
  if (!isWorkerApprovalsTerminalParty(party)) {
    return []
  }
  return [
    party,
    ...readCrewOwnedRunAddresses(db, {
      orcaSessionId: null,
      paneKey: paneForHandle(party),
      terminalHandle: party
    })
  ]
}
