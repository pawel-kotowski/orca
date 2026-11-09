// Local (glass build): a workspace's Git Graph opens as one virtual editor tab, like check details.
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { openWorkspaceEditorItem } from '@/store/slices/editor/tabs/workspace-editor-item'
import { isFolderRepo } from '../../../../../shared/repo-kind'
import { getRepoIdFromWorktreeId } from '../../../../../shared/worktree/id'
import {
  getCheckRunDetailsOwnerScope,
  resolveCheckRunDetailsOwnership
} from '@/store/slices/editor/actions/check-run-details-owner'

// Worktree ids repeat across hosts, so a remote owner (a box's workspace) keys its own tab and the
// tab records that owner, as check-details tabs do; otherwise it would be filed under this machine.
function gitGraphOwnership(worktreeId: string) {
  const ownership = resolveCheckRunDetailsOwnership(useAppStore.getState(), worktreeId)
  return { ownership, scope: getCheckRunDetailsOwnerScope(ownership) }
}

export function gitGraphTabId(worktreeId: string): string {
  const { scope } = gitGraphOwnership(worktreeId)
  return scope ? `${worktreeId}::git-graph@${scope}` : `${worktreeId}::git-graph`
}

/** `targetGroupId`: the tab group to open in (the + menu's group); the active group otherwise. */
export function openGitGraphTab(worktreeId: string, targetGroupId?: string): void {
  const id = gitGraphTabId(worktreeId)
  const { ownership } = gitGraphOwnership(worktreeId)
  const label = translate('local.gitGraph.title', 'Git Graph')
  useAppStore.setState((s) => {
    const focus = {
      activeFileId: id,
      activeTabType: 'editor' as const,
      activeFileIdByWorktree: { ...s.activeFileIdByWorktree, [worktreeId]: id },
      activeTabTypeByWorktree: { ...s.activeTabTypeByWorktree, [worktreeId]: 'editor' as const }
    }
    if (s.openFiles.some((file) => file.id === id)) {
      return focus
    }
    const file: OpenFile = {
      id,
      filePath: id,
      relativePath: label,
      worktreeId,
      ...ownership,
      language: 'plaintext',
      isDirty: false,
      mode: 'git-graph'
    }
    return { openFiles: [...s.openFiles, file], ...focus }
  })
  openWorkspaceEditorItem(
    useAppStore.getState(),
    id,
    worktreeId,
    label,
    'check-details',
    false,
    targetGroupId
  )
}

/** The group a commit's diff opens in: another group beside the graph, made on first use. */
export function gitGraphDiffTargetGroupId(worktreeId: string): string | undefined {
  const state = useAppStore.getState()
  const graphTab = (state.unifiedTabsByWorktree?.[worktreeId] ?? []).find(
    (tab) => tab.entityId === gitGraphTabId(worktreeId)
  )
  if (!graphTab) {
    return undefined
  }
  const otherGroup = (state.groupsByWorktree?.[worktreeId] ?? []).find(
    (group) => group.id !== graphTab.groupId
  )
  if (otherGroup) {
    return otherGroup.id
  }
  return state.createEmptySplitGroup?.(worktreeId, graphTab.groupId, 'right') ?? undefined
}

/** Whether a workspace can show a Git Graph: hidden only for a project known to be a plain folder
 *  (a remote host's project this window has no record of still gets it). */
export function useGitGraphAvailable(worktreeId: string): boolean {
  // The id names its project, so this reads one repo, never every workspace (the + menu re-renders often).
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  return useAppStore((s) => {
    const repo = s.repos.find((candidate) => candidate.id === repoId)
    return !(repo && isFolderRepo(repo))
  })
}
