import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { useActivityProjectColor } from '../activity/activity-project-color'
import { ActivityMachineMark } from '../activity/activity-machine-mark'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { parseExecutionHostId } from '../../../../shared/execution-host'
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
  const place = useAppStore(
    useShallow((state) => {
      const worktreeId = worktreeIdForTab(state.tabsByWorktree, terminalTabId)
      if (!worktreeId) {
        return null
      }
      if (worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
        return {
          local: false,
          machine: null,
          repo: null,
          workspace: translate('components.activity.floatingWorkspace', 'Floating workspace')
        }
      }
      const worktree = state.getKnownWorktreeById(worktreeId)
      const repo = worktree ? state.repos.find((entry) => entry.id === worktree.repoId) : undefined
      const local =
        parseExecutionHostId(getExecutionHostIdForWorktree(state, worktreeId))?.kind === 'local'
      return {
        // Why: this computer draws as its mark, as on activity cards; only another machine is named.
        local,
        machine: local ? null : selectWorktreeHostDisplayLabel(state, worktreeId)?.trim() || null,
        repo: repo ?? null,
        workspace: worktree ? getActivityThreadWorkspaceTitle(worktree).trim() || null : null
      }
    })
  )
  const projectColor = useActivityProjectColor(place?.repo ?? null)
  if (!place) {
    return null
  }
  const project = place.repo?.displayName?.trim() || null
  const title = [place.local ? null : place.machine, project, place.workspace]
    .filter(Boolean)
    .join(' · ')
  if (!title) {
    return null
  }
  const separator = <span className="text-chat-foreground-faint/60"> · </span>
  // Why: the machine stays quiet, the project takes its own colour (as its activity card does) and
  // the workspace reads in the chat's text colour, so the line says where at a glance.
  return (
    // Why ml-auto and max-w-full: right-aligned beside the limits, or on a row of its own when
    // they leave no room (the footer wraps), cut only if even a whole row is too narrow.
    <span
      className="ml-auto flex min-w-0 max-w-full items-center gap-1.5 text-2xs text-chat-foreground-faint"
      title={title}
      data-native-chat-place=""
    >
      {place.local ? <ActivityMachineMark remoteName={null} /> : null}
      <span className="min-w-0 truncate">
        {place.machine ? <span>{place.machine}</span> : null}
        {place.machine && project ? separator : null}
        {project ? (
          <span
            className="font-medium"
            style={
              projectColor
                ? { color: `color-mix(in oklab, ${projectColor} 75%, var(--chat-foreground))` }
                : undefined
            }
          >
            {project}
          </span>
        ) : null}
        {(place.machine || project) && place.workspace ? separator : null}
        {place.workspace ? <span className="text-chat-foreground">{place.workspace}</span> : null}
      </span>
    </span>
  )
}
