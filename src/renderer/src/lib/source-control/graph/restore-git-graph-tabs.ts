// Local (glass build): Git Graph tabs come back after a restart. Upstream saves only edit-mode
// files and treats a Git Graph tab as transient (isTransientEditorContentType), so a restart
// dropped it, and a workspace whose active tab it was came back on another tab (Paweł,
// 2026-11-17: "it even closes my git graph tab in slack requested task implemenation ws which
// makes me crazy"). The saved tab bar still lists it, so after the session is restored each one
// is opened again through Orca's own openGitGraph, in its group and at its place, active again if
// it was, the group's other active tab kept if it was not. Opening is workspace-local: it never
// switches the workspace on screen. A workspace on another machine waits for that host.
import { useAppStore } from '@/store'
import type { WorkspaceSessionState } from '../../../../../shared/workspace-session/workspace-session-state-types'
import { openGitGraph } from './git-graph-tab'

type SavedGitGraphTab = {
  worktreeId: string
  groupId: string
  index: number | undefined
  wasActive: boolean
  activeTabId: string | undefined
}

const RETRY_MS = 3000
const MAX_TRIES = 40

export function savedGitGraphTabs(session: WorkspaceSessionState): SavedGitGraphTab[] {
  const saved: SavedGitGraphTab[] = []
  for (const [worktreeId, tabs] of Object.entries(session.unifiedTabs ?? {})) {
    for (const tab of tabs) {
      if (tab.contentType !== 'git-graph') {
        continue
      }
      const group = session.tabGroups?.[worktreeId]?.find(
        (candidate) => candidate.id === tab.groupId
      )
      const index = group?.tabOrder.indexOf(tab.id) ?? -1
      saved.push({
        worktreeId,
        groupId: tab.groupId,
        index: index >= 0 ? index : undefined,
        wasActive: group?.activeTabId === tab.id,
        activeTabId: group?.activeTabId ?? undefined
      })
    }
  }
  return saved
}

async function restore(tab: SavedGitGraphTab, tries: number): Promise<void> {
  const state = useAppStore.getState()
  const groupExists = state.groupsByWorktree?.[tab.worktreeId]?.some(
    (group) => group.id === tab.groupId
  )
  const opened = await openGitGraph(
    tab.worktreeId,
    () => (groupExists ? tab.groupId : undefined),
    tab.index
  )
  if (!opened) {
    // Its host not connected yet (a workspace on another machine), or the workspace is gone.
    if (tries < MAX_TRIES) {
      setTimeout(() => void restore(tab, tries + 1), RETRY_MS)
    }
    return
  }
  if (!tab.wasActive && tab.activeTabId) {
    // Opening made the graph its group's active tab; give the group back the tab it had.
    useAppStore
      .getState()
      .activateTab?.(tab.activeTabId, { worktreeId: tab.worktreeId, recordFocus: false })
  }
}

export function restoreSavedGitGraphTabs(session: WorkspaceSessionState): void {
  for (const tab of savedGitGraphTabs(session)) {
    void restore(tab, 0)
  }
}
