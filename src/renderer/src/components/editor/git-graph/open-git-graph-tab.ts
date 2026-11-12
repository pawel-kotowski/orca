// Local (glass build): entry points into a workspace's Git Graph tab beyond Orca's own sidebar
// button (the + menu), and where a commit's diffs open beside it. The tab itself is Orca's
// (openGitGraph: one 'git-graph' tab per workspace, opened on the workspace's own host).
import { useAppStore } from '@/store'
import { openGitGraph } from '@/lib/source-control/graph/git-graph-tab'
import { isFolderRepo } from '../../../../../shared/repo-kind'
import { getRepoIdFromWorktreeId } from '../../../../../shared/worktree/id'

/** `targetGroupId`: the tab group to open in (the + menu's group); the active group otherwise. */
export function openGitGraphTab(worktreeId: string, targetGroupId?: string): void {
  void openGitGraph(worktreeId, targetGroupId ? () => targetGroupId : undefined)
}

/** The group a commit's diff opens in: another group beside the graph, made on first use. */
export function gitGraphDiffTargetGroupId(worktreeId: string): string | undefined {
  const state = useAppStore.getState()
  const graphTab = (state.unifiedTabsByWorktree?.[worktreeId] ?? []).find(
    (tab) => tab.contentType === 'git-graph'
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
