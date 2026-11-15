import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store/index'
import type { AgentShowTourList } from '../../../../../shared/agent-show/agent-show-tour-library'
import { fetchWorktreeTours } from '@/agent-show/tour/tour-library-client'

export type ListedTour = AgentShowTourList['tours'][number]

export type TourGroup = {
  worktreeId: string
  worktreePath: string
  label: string
  /** The workspace on screen; its tours play here, the others' in theirs. */
  current: boolean
  tours: ListedTour[] | null
  error: string | null
}

// Why polling as well: the fs watcher only covers the workspace on screen, and not on every host.
const CURRENT_POLL_MS = 5_000
const OTHERS_POLL_MS = 30_000
const FS_SETTLE_MS = 300

type Listed = { tours: ListedTour[] | null; error: string | null }

/** The active workspace's tours, then the tours of the repo's other workspaces, kept current. */
export function useRepoTours(visible: boolean): { groups: TourGroup[]; refresh: () => void } {
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeRepoId = useAppStore((state) =>
    state.activeWorktreeId ? state.getKnownWorktreeById(state.activeWorktreeId)?.repoId : undefined
  )
  const repoWorktrees = useAppStore((state) =>
    activeRepoId ? state.worktreesByRepo[activeRepoId] : undefined
  )
  const activeWorktree = useAppStore((state) =>
    state.activeWorktreeId ? state.getKnownWorktreeById(state.activeWorktreeId) : undefined
  )
  const workspaces = useMemo(() => {
    const others = (repoWorktrees ?? []).filter(
      (worktree) => !worktree.isArchived && worktree.id !== activeWorktreeId
    )
    return [
      ...(activeWorktree ? [{ ...activeWorktree, current: true }] : []),
      ...others.map((worktree) => ({ ...worktree, current: false }))
    ].map(({ id, path, displayName, current }) => ({ id, path, label: displayName, current }))
  }, [activeWorktree, activeWorktreeId, repoWorktrees])

  const [listed, setListed] = useState<Record<string, Listed>>({})
  const inFlight = useRef(new Set<string>())
  const load = useCallback((worktreeId: string, worktreePath: string) => {
    if (inFlight.current.has(worktreeId)) {
      return
    }
    inFlight.current.add(worktreeId)
    void fetchWorktreeTours(worktreeId, worktreePath)
      .then(
        (list): Listed => ({ tours: list.tours, error: null }),
        (error: unknown): Listed => ({
          tours: null,
          error: error instanceof Error ? error.message : String(error)
        })
      )
      .then((next) => {
        inFlight.current.delete(worktreeId)
        setListed((was) => ({ ...was, [worktreeId]: next }))
      })
  }, [])

  const current = workspaces.find((workspace) => workspace.current)
  const refreshCurrent = useCallback(() => {
    if (current) {
      load(current.id, current.path)
    }
  }, [current, load])
  const refreshAll = useCallback(() => {
    for (const workspace of workspaces) {
      load(workspace.id, workspace.path)
    }
  }, [load, workspaces])

  useEffect(() => {
    if (!visible) {
      return
    }
    refreshAll()
    const currentTimer = setInterval(refreshCurrent, CURRENT_POLL_MS)
    const othersTimer = setInterval(refreshAll, OTHERS_POLL_MS)
    return () => {
      clearInterval(currentTimer)
      clearInterval(othersTimer)
    }
  }, [refreshAll, refreshCurrent, visible])

  useEffect(() => {
    if (!visible || !current) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = window.api.fs.onFsChanged((payload) => {
      if (payload.worktreePath === current.path) {
        clearTimeout(timer)
        timer = setTimeout(refreshCurrent, FS_SETTLE_MS)
      }
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [current, refreshCurrent, visible])

  const groups = workspaces.map((workspace) => ({
    worktreeId: workspace.id,
    worktreePath: workspace.path,
    label: workspace.label,
    current: workspace.current,
    tours: listed[workspace.id]?.tours ?? null,
    error: listed[workspace.id]?.error ?? null
  }))
  return { groups, refresh: refreshAll }
}
