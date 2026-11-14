import type { AppState } from '@/store/types'
import type { Tab } from '../../../../shared/tab-types'
import { useAppStore } from '@/store'
import { liveLinkOpenGroupIds } from '@/lib/links/placement/link-open-intent'

/** True only when the window shows the worktree and the tab is its group's active tab. */
export function isTabOnScreen(state: AppState, worktreeId: string, tabId: string): boolean {
  if (state.activeWorktreeId !== worktreeId) {
    return false
  }
  const tab = state.unifiedTabsByWorktree[worktreeId]?.find((candidate) => candidate.id === tabId)
  if (!tab || !liveLinkOpenGroupIds(state, worktreeId).has(tab.groupId)) {
    return false
  }
  return (
    state.groupsByWorktree[worktreeId]?.find((group) => group.id === tab.groupId)?.activeTabId ===
    tabId
  )
}

/** Resolves with the first non-null selection, or null after `timeoutMs`. */
export function waitForAppState<T>(
  select: (state: AppState) => T | null,
  timeoutMs: number
): Promise<T | null> {
  const now = select(useAppStore.getState())
  if (now !== null) {
    return Promise.resolve(now)
  }
  return new Promise((resolve) => {
    const finish = (value: T | null): void => {
      clearTimeout(timer)
      unsubscribe()
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    const unsubscribe = useAppStore.subscribe((state) => {
      const value = select(state)
      if (value !== null) {
        finish(value)
      }
    })
  })
}

/** The tab showing `entityId`, in `groupId` when given; layout-owner builds draw it a frame later. */
export function findEntityTab(
  state: AppState,
  worktreeId: string,
  entityId: string,
  groupId: string | undefined
): Tab | null {
  const tabs = (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(
    (tab) => tab.entityId === entityId && (!groupId || tab.groupId === groupId)
  )
  const activeTabIds = new Set(
    (state.groupsByWorktree[worktreeId] ?? []).map((group) => group.activeTabId)
  )
  return tabs.find((tab) => activeTabIds.has(tab.id)) ?? tabs[0] ?? null
}
