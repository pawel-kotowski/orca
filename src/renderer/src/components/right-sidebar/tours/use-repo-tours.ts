import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store/index'
import type { AppState } from '@/store/types'
import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { getProjectHostSetupProjectionFromState } from '@/store/projects/project-host-setup-selector'
import type { AgentShowTourList } from '../../../../../shared/agent-show/agent-show-tour-library'
import { fetchWorktreeTours } from '@/agent-show/tour/tour-library-client'
import { projectTourWorkspaces, type TourWorkspace } from './project-tour-workspaces'

export type ListedTour = AgentShowTourList['tours'][number] & {
  /** The other workspaces that have this same tour file, unchanged (see dedupeTourGroups). */
  alsoIn?: string[]
}

export type TourGroup = {
  /** Host and worktree id: ids can repeat across hosts. */
  key: string
  worktreeId: string
  worktreePath: string
  label: string
  /** The machine the workspace is on, when it is not the one the workspace on screen is on. */
  hostLabel: string | null
  archived: boolean
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

/** The tours of every workspace of the active workspace's project, on every host, kept current. */
export function useRepoTours(visible: boolean): { groups: TourGroup[]; refresh: () => void } {
  const activeWorktree = useAppStore((state) =>
    state.activeWorktreeId ? state.getKnownWorktreeById(state.activeWorktreeId) : undefined
  )
  const activeHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const setups = useAppStore((state) => getProjectHostSetupProjectionFromState(state).setups)
  const workspaces = useMemo(
    () =>
      projectTourWorkspaces({
        active: activeWorktree && 'displayName' in activeWorktree ? activeWorktree : undefined,
        activeHostId,
        worktreesByRepo,
        setups
      }),
    [activeHostId, activeWorktree, setups, worktreesByRepo]
  )
  const hostLabels = useAppStore(
    useShallow((state) => workspaces.map((workspace) => hostLabelOf(state, workspace, workspaces)))
  )

  const [listed, setListed] = useState<Record<string, Listed>>({})
  const inFlight = useRef(new Set<string>())
  const load = useCallback((workspace: TourWorkspace) => {
    const { key } = workspace
    if (inFlight.current.has(key)) {
      return
    }
    inFlight.current.add(key)
    void fetchWorktreeTours(workspace.id, workspace.path, workspace.runtimeEnvironmentId)
      .then(
        (list): Listed => ({ tours: list.tours, error: null }),
        (error: unknown): Listed => ({
          tours: null,
          error: error instanceof Error ? error.message : String(error)
        })
      )
      .then((next) => {
        inFlight.current.delete(key)
        setListed((was) => ({ ...was, [key]: next }))
      })
  }, [])

  // Why a signature: the worktree map changes on every status update; refetch only when the
  // set of workspaces (or where one lives) does.
  const signature = workspaces
    .map(
      (workspace) =>
        `${workspace.key}\u0001${workspace.path}\u0001${workspace.runtimeEnvironmentId}`
    )
    .join('\n')
  const latest = useRef(workspaces)
  useEffect(() => {
    latest.current = workspaces
  })
  const refreshCurrent = useCallback(() => {
    const current = latest.current.find((workspace) => workspace.current)
    if (current) {
      load(current)
    }
  }, [load])
  const refreshAll = useCallback(() => {
    for (const workspace of latest.current) {
      load(workspace)
    }
  }, [load])

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
  }, [refreshAll, refreshCurrent, signature, visible])

  const currentPath = workspaces.find((workspace) => workspace.current)?.path
  useEffect(() => {
    if (!visible || !currentPath) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = window.api.fs.onFsChanged((payload) => {
      if (payload.worktreePath === currentPath) {
        clearTimeout(timer)
        timer = setTimeout(refreshCurrent, FS_SETTLE_MS)
      }
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [currentPath, refreshCurrent, visible])

  const groups = workspaces.map((workspace, index) => ({
    key: workspace.key,
    worktreeId: workspace.id,
    worktreePath: workspace.path,
    label: workspace.label,
    hostLabel: hostLabels[index] ?? null,
    archived: workspace.archived,
    current: workspace.current,
    tours: listed[workspace.key]?.tours ?? null,
    error: listed[workspace.key]?.error ?? null
  }))
  return { groups, refresh: refreshAll }
}

/** A workspace's machine by its name in Settings, named only where it differs from the one on screen. */
function hostLabelOf(
  state: AppState,
  workspace: TourWorkspace,
  workspaces: readonly TourWorkspace[]
): string | null {
  const currentHost = workspaces.find((entry) => entry.current)?.hostId
  return workspace.hostId === currentHost
    ? null
    : selectExecutionHostDisplayLabel(state, workspace.hostId)
}
