import { useAgentStatusSelector } from '@/runtime/agent-status/use-agent-status'
import { isAgentStatusFresh } from '../../../../../../shared/agent-status/contracts/agent-status-freshness'
import type { AgentStatusState } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import {
  nativeChatHookHasWorkingSubagents,
  nativeChatHookWorkingStartedAt,
  resolveNativeChatHookState
} from '../../../../../../shared/native-chat/transcript/streaming/native-chat-live-status'

export function useNativeChatHookStatus(
  paneKey: string
): readonly [AgentStatusState | null, number | null, boolean] {
  // Primitive selectors avoid rerenders for unrelated status changes.
  const state = useAgentStatusSelector(paneKey, resolveNativeChatHookState)
  const stateStartedAt = useAgentStatusSelector(paneKey, nativeChatHookWorkingStartedAt)
  const hasWorkingSubagents = useAgentStatusSelector(paneKey, nativeChatHookHasWorkingSubagents)
  return [state, stateStartedAt, hasWorkingSubagents]
}

/** The pane's agent ended its turn and waits on its own background shell or Monitor. */
export function useNativeChatHeldByBackgroundWork(paneKey: string): boolean {
  return useAgentStatusSelector(
    paneKey,
    (entry) =>
      entry?.state === 'working' &&
      entry.workingMode === 'monitoring' &&
      isAgentStatusFresh(entry, Date.now())
  )
}
