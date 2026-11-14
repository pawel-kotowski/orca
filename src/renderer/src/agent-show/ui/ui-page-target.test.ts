import { describe, expect, it } from 'vitest'
import { resolveUiPageTarget, type UiPageTargetState } from './ui-page-target'

function state(): UiPageTargetState {
  const workspace = (id: string, worktreeId: string, activePageId: string | null) => ({
    id,
    worktreeId,
    activePageId
  })
  const page = (id: string) => ({ id })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the resolver reads only ids and activePageId.
  return {
    browserTabsByWorktree: {
      wt1: [workspace('tabA', 'wt1', 'p2'), workspace('tabB', 'wt1', null)],
      wt2: [workspace('tabC', 'wt2', 'p9')]
    },
    browserPagesByWorkspace: {
      tabA: [page('p1'), page('p2')],
      tabB: [page('p3')],
      tabC: [page('p9')]
    },
    activeBrowserTabIdByWorktree: { wt1: 'tabB' }
  } as unknown as UiPageTargetState
}

describe('resolveUiPageTarget', () => {
  it('uses the named page in its own browser tab', () => {
    expect(resolveUiPageTarget(state(), 'wt1', 'p1')).toEqual({
      ok: true,
      pageId: 'p1',
      workspaceId: 'tabA'
    })
  })

  it('refuses a page of another worktree and an unknown page', () => {
    expect(resolveUiPageTarget(state(), 'wt1', 'p9')).toMatchObject({
      ok: false,
      code: 'page_not_in_worktree'
    })
    expect(resolveUiPageTarget(state(), 'wt1', 'nope')).toMatchObject({
      ok: false,
      code: 'page_not_found'
    })
  })

  it("defaults to the active browser tab's shown page, else its first", () => {
    expect(resolveUiPageTarget(state(), 'wt1', undefined)).toEqual({
      ok: true,
      pageId: 'p3',
      workspaceId: 'tabB'
    })
    expect(resolveUiPageTarget(state(), 'wt2', undefined)).toEqual({
      ok: true,
      pageId: 'p9',
      workspaceId: 'tabC'
    })
  })

  it('says so when the worktree has no browser tab', () => {
    expect(resolveUiPageTarget(state(), 'wt3', undefined)).toMatchObject({
      ok: false,
      code: 'no_browser_page'
    })
  })
})
