import { useAppStore } from '@/store'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import { nativeChatCtrlEnterSendsNow } from '../../../../shared/native-chat/settings/native-chat-appearance-settings'

// Why: some tests stand a plain object in for the store; the setting's default holds there.
const useCtrlEnterSendsNowSetting: () => boolean =
  typeof useAppStore === 'function'
    ? () => useAppStore((state) => nativeChatCtrlEnterSendsNow(state.settings))
    : () => true

/**
 * Whether Ctrl+Enter sends now in this message box (not an edit or a launch prompt): a Claude chat
 * running in its terminal, where it types Claude's own send-now key, and any structured chat, whose
 * host steers the message into the running turn.
 */
export function useNativeChatCtrlEnterSendsNow(
  agent: AgentType,
  box: 'terminal' | 'structured' | null
): boolean {
  const enabled = useCtrlEnterSendsNowSetting()
  return enabled && (box === 'structured' || (box === 'terminal' && agent === 'claude'))
}
