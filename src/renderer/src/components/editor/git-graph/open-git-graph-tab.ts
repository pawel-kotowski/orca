// Local (glass build): a workspace's Git Graph opens as one virtual editor tab, like check details.
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import { openWorkspaceEditorItem } from '@/store/slices/editor/tabs/workspace-editor-item'

export function gitGraphTabId(worktreeId: string): string {
  return `${worktreeId}::git-graph`
}

export function openGitGraphTab(worktreeId: string): void {
  const id = gitGraphTabId(worktreeId)
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
      language: 'plaintext',
      isDirty: false,
      mode: 'git-graph'
    }
    return { openFiles: [...s.openFiles, file], ...focus }
  })
  openWorkspaceEditorItem(useAppStore.getState(), id, worktreeId, label, 'check-details')
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
