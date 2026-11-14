import type {
  AgentShowContext,
  AgentShowRequestOf
} from '../../../../shared/agent-show/agent-show-contract'

export type UiPageMark = {
  key: string
  label: string
  ownerTabId: string | null
  worktreeId: string
  /** Who asked, so a click on the mark's code shows it as that owner. */
  context: AgentShowContext
  code: AgentShowRequestOf<'ui'>['code'] | null
}

type MarkedPage = { url: string; marks: Map<string, UiPageMark> }

// Keyed by browser page id; marks follow the page, not the store.
const pages = new Map<string, MarkedPage>()

export function uiPageMarkKey(ownerTabId: string | null, label: string): string {
  return `${ownerTabId ?? 'user'}:${label}`
}

/** The next free number among this owner's marks on the page: 1, 2, 3… */
export function nextUiMarkLabel(pageId: string, ownerTabId: string | null): string {
  const taken = new Set(
    Array.from(pages.get(pageId)?.marks.values() ?? [])
      .filter((mark) => mark.ownerTabId === ownerTabId)
      .map((mark) => mark.label)
  )
  let next = 1
  while (taken.has(String(next))) {
    next += 1
  }
  return String(next)
}

export function putUiPageMark(pageId: string, url: string, mark: UiPageMark): void {
  const page = pages.get(pageId) ?? { url, marks: new Map() }
  page.url = url
  page.marks.set(mark.key, mark)
  pages.set(pageId, page)
}

export function getUiPageMark(pageId: string, key: string): UiPageMark | null {
  return pages.get(pageId)?.marks.get(key) ?? null
}

export function forgetUiPage(pageId: string): void {
  pages.delete(pageId)
}

/** Removes the owner's marks in the worktree; answers the keys each page must drop. */
export function takeOwnerUiMarks(
  worktreeId: string,
  ownerTabId: string | null
): Map<string, string[]> {
  const removed = new Map<string, string[]>()
  for (const [pageId, page] of pages) {
    for (const mark of Array.from(page.marks.values())) {
      if (mark.worktreeId === worktreeId && mark.ownerTabId === ownerTabId) {
        page.marks.delete(mark.key)
        removed.set(pageId, [...(removed.get(pageId) ?? []), mark.key])
      }
    }
    if (page.marks.size === 0) {
      pages.delete(pageId)
    }
  }
  return removed
}

export function uiPagesWithMarks(
  worktreeId: string
): { pageId: string; url: string; marks: string[] }[] {
  return Array.from(pages)
    .map(([pageId, page]) => ({
      pageId,
      url: page.url,
      marks: Array.from(page.marks.values())
        .filter((mark) => mark.worktreeId === worktreeId)
        .map((mark) => mark.label)
    }))
    .filter((page) => page.marks.length > 0)
}
