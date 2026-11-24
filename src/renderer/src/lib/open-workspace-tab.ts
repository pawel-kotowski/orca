import type { AppState } from '@/store/types'
import { selectActiveTabForWorktree } from '@/store/slices/tabs/active-tab-selection'

type OpenTabState = Pick<
  AppState,
  | 'activeTabType'
  | 'activeTabId'
  | 'activeWorktreeId'
  | 'activeGroupIdByWorktree'
  | 'groupsByWorktree'
  | 'unifiedTabsByWorktree'
>

/** The open tab as an activity card names it; `activeTabId` keeps the last terminal while a chat is open. */
export function openWorkspaceTabId(state: OpenTabState): string | null {
  if (state.activeTabType !== 'agent-session') {
    return state.activeTabId
  }
  return state.activeWorktreeId
    ? (selectActiveTabForWorktree(state, state.activeWorktreeId)?.id ?? null)
    : null
}
