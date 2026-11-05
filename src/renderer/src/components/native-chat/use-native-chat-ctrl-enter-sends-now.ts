import { useAppStore } from '@/store'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import { nativeChatCtrlEnterSendsNow } from '../../../../shared/native-chat/native-chat-appearance-settings'

// Why: some tests stand a plain object in for the store; the setting's default holds there.
const useCtrlEnterSendsNowSetting: () => boolean =
  typeof useAppStore === 'function'
    ? () => useAppStore((state) => nativeChatCtrlEnterSendsNow(state.settings))
    : () => true

/**
 * Whether Ctrl+Enter sends now in this message box: only a Claude chat running in its terminal,
 * where it types Claude's own send-now key, and only for a message (not an edit or a launch prompt).
 */
export function useNativeChatCtrlEnterSendsNow(
  agent: AgentType,
  terminalMessageBox: boolean
): boolean {
  const enabled = useCtrlEnterSendsNowSetting()
  return enabled && agent === 'claude' && terminalMessageBox
}
