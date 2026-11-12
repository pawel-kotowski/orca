// Local (glass build): pages a workspace's commit history for the classic Git Graph view
// (GitGraphView); Orca's own Git Graph tab pages through use-git-graph-history.ts.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useWorktreeById } from '@/store/workspaces/selection/use-selected-worktree'
import { getConnectionId } from '@/lib/workspace/ownership/connection-context'
import { getRuntimeGitHistory } from '@/runtime/source-control/git/runtime-git-status-client'
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

export function useClassicGitGraphHistory(
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
      // Why the first page's token: later pages walk the same revisions it pinned on the host.
      const historyToken = append ? stateRef.current.result?.historyToken : undefined
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        const page = await getRuntimeGitHistory(
          {
            target: requireGitOwnerTarget(ownerTarget),
            worktreeId,
            worktreePath,
            connectionId: getConnectionId(worktreeId) ?? undefined
          },
          {
            limit: GIT_GRAPH_PAGE_SIZE,
            skip,
            refs: allRefs ? 'all' : 'head',
            ...(historyToken ? { historyToken } : {}),
            wakeWslDistro: true
          }
        )
        if (requestRef.current !== requestId) {
          return
        }
        if (append && page.historyChanged) {
          // The pinned revisions expired or moved: start over from the top.
          void loadRef.current(false)
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
  const loadRef = useRef(load)
  loadRef.current = load

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
