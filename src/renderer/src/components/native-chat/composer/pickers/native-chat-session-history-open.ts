import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import { isAiVaultAgent } from '../../../../../../shared/ai-vault/contracts/ai-vault-types'
import { selectAiVaultPanelWorkspace } from '@/components/right-sidebar/ai-vault/scope/ai-vault-panel-workspace'
import { openAgentSessionHistoryModal } from '@/components/right-sidebar/ai-vault/panel/agent-session-history-modal'
import { findNativeChatTabOwnerWorktreeId } from '@/components/native-chat/pane/ownership/native-chat-tab-owner'

/**
 * Open Session History for the chat in `terminalTabId`: what `/resume` and the chat's Resume button
 * do. A structured chat's pick replaces it in place; a terminal chat's resumes in a terminal, never
 * as an SDK chat. Returns why it could not open, or null.
 */
export function openNativeChatSessionHistory(args: {
  terminalTabId: string
  agent: AgentType
  structuredWorktreeId?: string
  resumesInPlace: boolean
  search: string
}): string | null {
  const state = useAppStore.getState()
  const worktreeId =
    args.structuredWorktreeId ?? findNativeChatTabOwnerWorktreeId(state, args.terminalTabId)
  // Use the active execution host when the on-screen workspace ID matches.
  const executionHostId =
    worktreeId === state.activeWorktreeId
      ? (state.activeWorkspaceExecutionHostId ?? undefined)
      : undefined
  const workspace = worktreeId
    ? { worktreeId, ...(executionHostId ? { executionHostId } : {}) }
    : null
  // Refuse unresolved ownership so Workspace cannot silently open another workspace’s history.
  if (!workspace || !selectAiVaultPanelWorkspace(state, workspace).worktree) {
    return translate(
      'components.native-chat.resumeCommand.workspaceUnavailable',
      "This chat's workspace isn't loaded yet. Try /resume again in a moment."
    )
  }
  openAgentSessionHistoryModal({
    workspace,
    chatTabId: args.terminalTabId,
    resumesInPlace: args.resumesInPlace,
    initialQuery: args.search,
    ...(isAiVaultAgent(args.agent) ? { agent: args.agent } : {})
  })
  return null
}
