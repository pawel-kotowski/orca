import type { AppState } from '@/store/types'

export type UiPageTargetState = Pick<
  AppState,
  'browserTabsByWorktree' | 'browserPagesByWorkspace' | 'activeBrowserTabIdByWorktree'
>

export type UiPageTarget =
  | { ok: true; pageId: string; workspaceId: string }
  | { ok: false; code: string; message: string }

/** The page `orca show ui` marks: `pageId` when given, else the worktree's active browser tab's page. */
export function resolveUiPageTarget(
  state: UiPageTargetState,
  worktreeId: string,
  pageId: string | undefined
): UiPageTarget {
  const workspaces = state.browserTabsByWorktree[worktreeId] ?? []
  const pagesOf = (workspaceId: string): string[] =>
    (state.browserPagesByWorkspace[workspaceId] ?? []).map((page) => page.id)

  if (pageId) {
    const owner = workspaces.find((workspace) => pagesOf(workspace.id).includes(pageId))
    if (owner) {
      return { ok: true, pageId, workspaceId: owner.id }
    }
    const elsewhere = Object.values(state.browserTabsByWorktree)
      .flat()
      .some((workspace) => pagesOf(workspace.id).includes(pageId))
    return elsewhere
      ? {
          ok: false,
          code: 'page_not_in_worktree',
          message: `Browser page ${pageId} belongs to another worktree`
        }
      : { ok: false, code: 'page_not_found', message: `Browser page ${pageId} was not found` }
  }

  const activeId = state.activeBrowserTabIdByWorktree[worktreeId]
  const workspace = workspaces.find((candidate) => candidate.id === activeId) ?? workspaces[0]
  const pages = workspace ? pagesOf(workspace.id) : []
  const chosen =
    workspace?.activePageId && pages.includes(workspace.activePageId)
      ? workspace.activePageId
      : pages[0]
  if (!workspace || !chosen) {
    return {
      ok: false,
      code: 'no_browser_page',
      message: 'No browser tab is open in this worktree; open one with `orca tab create <url>`'
    }
  }
  return { ok: true, pageId: chosen, workspaceId: workspace.id }
}

/** The page is the shown page of its browser tab, and that tab is the one its group shows, in the worktree on screen. */
export function isUiPageOnScreen(
  state: UiPageTargetState &
    Pick<AppState, 'activeWorktreeId' | 'unifiedTabsByWorktree' | 'groupsByWorktree'>,
  worktreeId: string,
  target: { pageId: string; workspaceId: string }
): boolean {
  if (state.activeWorktreeId !== worktreeId) {
    return false
  }
  const workspace = (state.browserTabsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === target.workspaceId
  )
  const pages = state.browserPagesByWorkspace[target.workspaceId] ?? []
  const shownPage = workspace?.activePageId ?? pages[0]?.id
  const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.contentType === 'browser' && candidate.entityId === target.workspaceId
  )
  const group = (state.groupsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === tab?.groupId
  )
  return shownPage === target.pageId && tab !== undefined && group?.activeTabId === tab.id
}
