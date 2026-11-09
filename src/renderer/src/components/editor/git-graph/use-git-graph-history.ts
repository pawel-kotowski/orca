// Local (glass build): pages a workspace's commit history for the Git Graph tab.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useWorktreeById } from '@/store/selectors'
import { getConnectionId } from '@/lib/connection-context'
import { getRuntimeGitHistory } from '@/runtime/runtime-git-status-client'
import {
  requireGitOwnerTarget,
  useWorktreeGitOwnerTarget
} from '@/components/right-sidebar/source-control/sync/worktree-git-owner-target'
import type {
  GitHistoryItem,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'

export const GIT_GRAPH_PAGE_SIZE = 200

export type GitGraphHistoryState = {
  loading: boolean
  error: string | null
  /** The first page's facts (current ref, upstream); items are every page so far. */
  result: GitHistoryResult | null
  items: GitHistoryItem[]
  hasMore: boolean
}

// The tab remounts when its group splits or moves; keep what it loaded so a remount neither
// flashes empty nor drops pages already scrolled through. Keyed by workspace and scope.
const loadedByKey = new Map<string, GitGraphHistoryState & { head: string | null }>()

const EMPTY: GitGraphHistoryState = {
  loading: true,
  error: null,
  result: null,
  items: [],
  hasMore: false
}

export function useGitGraphHistory(
  worktreeId: string,
  allRefs: boolean
): GitGraphHistoryState & {
  worktreePath: string | null
  refresh: () => void
  loadMore: () => void
} {
  const worktree = useWorktreeById(worktreeId)
  const worktreePath = worktree?.path ?? null
  const ownerTarget = useWorktreeGitOwnerTarget(worktreeId)
  const head = useAppStore((s) => s.gitStatusHeadByWorktree[worktreeId] ?? null)
  const cacheKey = `${worktreeId}|${allRefs ? 'all' : 'head'}`
  const [state, setState] = useState<GitGraphHistoryState>(() => loadedByKey.get(cacheKey) ?? EMPTY)
  const [stateKey, setStateKey] = useState(cacheKey)
  if (stateKey !== cacheKey) {
    setStateKey(cacheKey)
    setState(loadedByKey.get(cacheKey) ?? EMPTY)
  }
  const requestRef = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const load = useCallback(
    async (append: boolean): Promise<void> => {
      if (!worktreePath) {
        return
      }
      const requestId = ++requestRef.current
      const skip = append ? stateRef.current.items.length : 0
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const page = await getRuntimeGitHistory(
          {
            target: requireGitOwnerTarget(ownerTarget),
            worktreeId,
            worktreePath,
            connectionId: getConnectionId(worktreeId) ?? undefined
          },
          { limit: GIT_GRAPH_PAGE_SIZE, skip, allRefs, wakeWslDistro: true }
        )
        if (requestRef.current !== requestId) {
          return
        }
        setState((prev) => {
          const next = {
            loading: false,
            error: null,
            result: append && prev.result ? prev.result : page,
            items: append ? [...prev.items, ...page.items] : page.items,
            hasMore: page.hasMore
          }
          loadedByKey.set(cacheKey, { ...next, head })
          return next
        })
      } catch (error) {
        if (requestRef.current !== requestId) {
          return
        }
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        }))
      }
    },
    [allRefs, cacheKey, head, ownerTarget, worktreeId, worktreePath]
  )

  // Reload from the top when the scope changes or the workspace's HEAD moves; a remount over a
  // history loaded at this HEAD keeps it (Refresh still reloads).
  useEffect(() => {
    const cached = loadedByKey.get(cacheKey)
    if (cached && cached.head === head && !cached.error) {
      return
    }
    void load(false)
  }, [cacheKey, head, load])

  const refresh = useCallback(() => void load(false), [load])
  const loadMore = useCallback(() => {
    if (!stateRef.current.loading && stateRef.current.hasMore) {
      void load(true)
    }
  }, [load])

  return { ...state, worktreePath, refresh, loadMore }
}
