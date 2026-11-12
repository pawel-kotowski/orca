import { parseOrcaSessionAddress } from '../orca-session-address'

/** A terminal-hosted coordinator's party: its Orca terminal handle. */
export function isWorkerApprovalsTerminalParty(party: string): boolean {
  return /^term_[a-zA-Z0-9_-]+$/.test(party)
}

/** Which chats can follow their workers' approvals: a structured chat by its Orca session, a
 *  terminal-backed chat by its terminal handle. Runs and Dispatches are not chats. */
export function isWorkerApprovalsParty(party: string): boolean {
  return parseOrcaSessionAddress(party) !== null || isWorkerApprovalsTerminalParty(party)
}
