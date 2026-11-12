import type { HookListenerState } from './listener-state'
import type { ParsedAgentStatusPayload } from '../agent-status/contracts/agent-status-types'

/** Every status a pane's agent reports carries the last time it moved itself to the Inbox
 *  (agent-reach-out.ts): a mirror may coalesce rows, and the row that took it must not be lost. */
export function withPaneReachOut(
  state: HookListenerState,
  paneKey: string,
  payload: ParsedAgentStatusPayload
): ParsedAgentStatusPayload {
  const reachOut = state.reachOutByPaneKey.get(paneKey)
  return reachOut && payload.reachOut?.at !== reachOut.at ? { ...payload, reachOut } : payload
}
