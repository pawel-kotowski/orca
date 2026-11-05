import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../../store'
import { findTabAgentEntry } from './native-chat-tab-agent-entry'

export function useNativeChatStatusEntry(
  terminalTabId: string,
  preferredPaneKey: string | undefined
) {
  const entry = useAppStore(
    useShallow((state) =>
      preferredPaneKey
        ? state.agentStatusByPaneKey[preferredPaneKey]
        : findTabAgentEntry(state.agentStatusByPaneKey, terminalTabId)
    )
  )
  const paneKey = preferredPaneKey ?? entry?.paneKey ?? `${terminalTabId}:`
  // Why: an idle agent restored at startup has its session here, not in live status.
  const sleepingSession = useAppStore((state) => state.sleepingAgentSessionsByPaneKey[paneKey])
  return { entry, paneKey, sleepingSession }
}
