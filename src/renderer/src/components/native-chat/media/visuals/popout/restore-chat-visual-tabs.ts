// A popped-out chat visual comes back after a restart, as Git Graph tabs do (restore-git-graph-tabs.ts):
// upstream treats virtual editor tabs as transient, but the saved tab bar still lists it, and its
// file id carries the whole identity, so it is opened again in its group and at its place.
import { useAppStore } from '@/store'
import type { WorkspaceSessionState } from '../../../../../../../shared/workspace-session/workspace-session-state-types'
import { parseChatVisualTabFileId } from '../../../../../../../shared/native-chat/visuals/chat-visual-tab-identity'
import { openChatVisualTab } from './open-chat-visual-tab'

const RETRY_MS = 3000
const MAX_TRIES = 40

type SavedChatVisualTab = {
  worktreeId: string
  entityId: string
  groupId: string
  index: number | undefined
  wasActive: boolean
  activeTabId: string | undefined
}

function savedChatVisualTabs(session: WorkspaceSessionState): SavedChatVisualTab[] {
  const saved: SavedChatVisualTab[] = []
  for (const [worktreeId, tabs] of Object.entries(session.unifiedTabs ?? {})) {
    for (const tab of tabs) {
      if (tab.contentType !== 'chat-visual') {
        continue
      }
      const group = session.tabGroups?.[worktreeId]?.find((entry) => entry.id === tab.groupId)
      const index = group?.tabOrder.indexOf(tab.id) ?? -1
      saved.push({
        worktreeId,
        entityId: tab.entityId,
        groupId: tab.groupId,
        index: index >= 0 ? index : undefined,
        wasActive: group?.activeTabId === tab.id,
        activeTabId: group?.activeTabId ?? undefined
      })
    }
  }
  return saved
}

function restore(tab: SavedChatVisualTab, tries: number): void {
  const identity = parseChatVisualTabFileId(tab.entityId)
  if (!identity) {
    return
  }
  const state = useAppStore.getState()
  const groupExists = state.groupsByWorktree?.[tab.worktreeId]?.some(
    (group) => group.id === tab.groupId
  )
  const opened = openChatVisualTab(identity, tab.worktreeId, {
    groupId: groupExists ? tab.groupId : undefined,
    groupIndex: tab.index
  })
  if (!opened) {
    // Its host not connected yet, or the workspace is gone.
    if (tries < MAX_TRIES) {
      setTimeout(() => restore(tab, tries + 1), RETRY_MS)
    }
    return
  }
  if (!tab.wasActive && tab.activeTabId) {
    useAppStore
      .getState()
      .activateTab?.(tab.activeTabId, { worktreeId: tab.worktreeId, recordFocus: false })
  }
}

export function restoreSavedChatVisualTabs(session: WorkspaceSessionState): void {
  for (const tab of savedChatVisualTabs(session)) {
    restore(tab, 0)
  }
}
