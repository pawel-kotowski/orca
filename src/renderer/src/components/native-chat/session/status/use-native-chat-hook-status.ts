import { useAppStore } from '../../../../store/index'
import { isAgentStatusFresh } from '../../../../../../shared/agent-status/contracts/agent-status-freshness'
import type { AgentStatusState } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import {
  nativeChatHookHasWorkingSubagents,
  resolveNativeChatHookState
} from '../../../../../../shared/native-chat/native-chat-live-status'

export function useNativeChatHookStatus(
  paneKey: string
): readonly [AgentStatusState | null, number | null, boolean] {
  // Primitive selectors avoid rerenders for unrelated status changes.
  const state = useAppStore((store) =>
    resolveNativeChatHookState(store.agentStatusByPaneKey[paneKey])
  )
  const stateStartedAt = useAppStore(
    (store) => store.agentStatusByPaneKey[paneKey]?.stateStartedAt ?? null
  )
  const hasWorkingSubagents = useAppStore((store) =>
    nativeChatHookHasWorkingSubagents(store.agentStatusByPaneKey[paneKey])
  )
  return [state, stateStartedAt, hasWorkingSubagents]
}

/** The pane's agent ended its turn and waits on its own background shell or Monitor. */
export function useNativeChatHeldByBackgroundWork(paneKey: string): boolean {
  return useAppStore((store) => {
    const entry = store.agentStatusByPaneKey[paneKey]
    return (
      entry?.state === 'working' &&
      entry.workingMode === 'monitoring' &&
      isAgentStatusFresh(entry, Date.now())
    )
  })
}
