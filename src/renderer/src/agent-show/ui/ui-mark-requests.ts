import type {
  AgentShowContext,
  AgentShowRequestOf
} from '../../../../shared/agent-show/agent-show-contract'
import { signalAgentShowChange } from '../persistence/agent-show-change-signal'

export type ShownUiRequest = { pageId: string; request: AgentShowRequestOf<'ui'> }

// Why requests, not drawn marks: a reloaded page has new nodes, so its marks are shown again.
const requestsByOwner = new Map<string, ShownUiRequest[]>()

const ownerKey = (context: AgentShowContext): string =>
  `${context.worktreeId}\u0000${context.ownerTabId ?? ''}`

export function rememberUiRequest(context: AgentShowContext, shown: ShownUiRequest): void {
  const label = shown.request.mark
  const kept = (requestsByOwner.get(ownerKey(context)) ?? []).filter(
    (earlier) => !label || earlier.pageId !== shown.pageId || earlier.request.mark !== label
  )
  requestsByOwner.set(ownerKey(context), [...kept, shown])
  signalAgentShowChange()
}

export function forgetUiRequests(context: AgentShowContext): void {
  if (requestsByOwner.delete(ownerKey(context))) {
    signalAgentShowChange()
  }
}

export function uiRequestsOf(context: AgentShowContext): ShownUiRequest[] {
  return [...(requestsByOwner.get(ownerKey(context)) ?? [])]
}
