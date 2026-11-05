import { useAppStore } from '@/store'
import { getActivityThreadWorkspaceTitle } from '@/lib/activity-thread-display'
import { selectWorktreeHostDisplayLabel } from '@/lib/execution-host-display-label'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { translate } from '@/i18n/i18n'
import { useNativeChatAccountScope, worktreeIdForTab } from './native-chat-account-usage'

/**
 * Where this chat runs: its machine, project and workspace, e.g. "robo-pc-107 · aikros_engine ·
 * fix-slack-agent". Paweł, 2026-11-05: the machine, project and workspace title are useful under
 * the message box beside the subscription and its limits.
 */
export function NativeChatPlaceLine(): React.JSX.Element | null {
  const scope = useNativeChatAccountScope()
  // Why: only a terminal-backed chat has a tab to place; the store is read only for one.
  return scope ? <TerminalChatPlaceLine terminalTabId={scope.terminalTabId} /> : null
}

function TerminalChatPlaceLine({
  terminalTabId
}: {
  terminalTabId: string
}): React.JSX.Element | null {
  const place = useAppStore((state) => {
    const worktreeId = worktreeIdForTab(state.tabsByWorktree, terminalTabId)
    if (!worktreeId) {
      return ''
    }
    if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
      return translate('components.activity.floatingWorkspace', 'Floating workspace')
    }
    const worktree = state.getKnownWorktreeById(worktreeId)
    const repo = worktree ? state.repos.find((entry) => entry.id === worktree.repoId) : undefined
    return [
      selectWorktreeHostDisplayLabel(state, worktreeId),
      repo?.displayName,
      worktree ? getActivityThreadWorkspaceTitle(worktree) : null
    ]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' · ')
  })
  if (!place) {
    return null
  }
  return (
    <span
      className="ml-auto min-w-0 truncate text-xs text-chat-foreground-faint"
      title={place}
      data-native-chat-place=""
    >
      {place}
    </span>
  )
}
