// Local (glass build): the Git Graph pages by itself. A page of commits can fold into a few rows
// (Branches), leaving the list no room to scroll, so nearness to the end is checked after every
// page and resize, not only on scroll (Paweł, 2026-11-25: "i have to constantly click load more").
import { useCallback, useEffect, useRef } from 'react'
import { GIT_GRAPH_ROW_HEIGHT } from './git-graph-row'

const NEAR_END = GIT_GRAPH_ROW_HEIGHT * 40

/** Returns the check for the list's scroll handler. */
export function useGitGraphAutoPage({
  listRef,
  rowCount,
  items,
  hasMore,
  loading,
  error,
  loadMore
}: {
  listRef: React.RefObject<HTMLDivElement | null>
  rowCount: number
  /** The loaded commits: a new array after every load. */
  items: readonly unknown[]
  hasMore: boolean
  loading: boolean
  error: string | null
  loadMore: () => void
}): () => void {
  const askedRef = useRef<readonly unknown[] | null>(null)
  const check = useCallback(() => {
    const list = listRef.current
    // A hidden tab measures 0 tall and would page through the whole history; a failed page waits
    // for Try again. Asked once per loaded list: a reload that overtakes a page makes a new one.
    if (!list || list.clientHeight === 0 || !hasMore || loading || error) {
      return
    }
    if (
      list.scrollHeight - list.scrollTop - list.clientHeight < NEAR_END &&
      askedRef.current !== items
    ) {
      askedRef.current = items
      loadMore()
    }
  }, [error, hasMore, listRef, loadMore, loading, items])

  useEffect(check, [check, rowCount])
  useEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }
    const observer = new ResizeObserver(check)
    observer.observe(list)
    return () => observer.disconnect()
  }, [check, listRef])
  return check
}
