import { useEffect, useRef } from 'react'
import {
  getProjectHostSetupSelectionKey,
  type ProjectHostSetupOption
} from '@/lib/project-host-setup-options'

/**
 * The machine a new workspace last ran on, per project, with the last machine overall as the
 * fallback (Paweł, 2026-11-09: "recent run on should be remembered when i start new workspace
 * (like devbox or local, etc)"). Kept in localStorage; a dialog opened for a given target ignores it.
 */
const STORAGE_KEY = 'orca.composer.recentRunTarget'

type Stored = { byProject: Record<string, { id: string; hostId: string }>; lastHostId?: string }

function read(): Stored {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (value && typeof value === 'object' && 'byProject' in value) {
      return value as Stored
    }
  } catch {
    // Unreadable: start over.
  }
  return { byProject: {} }
}

export function rememberComposerRunTarget(
  projectId: string | null,
  option: { id: string; hostId: string }
): void {
  if (!projectId) {
    return
  }
  const stored = read()
  stored.byProject[projectId] = { id: option.id, hostId: option.hostId }
  stored.lastHostId = option.hostId
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // Storage unavailable: nothing is remembered.
  }
}

/** The remembered target among this project's ready options, else one on the last machine. */
export function recentComposerRunTarget(
  projectId: string,
  options: readonly ProjectHostSetupOption[],
  stored: Stored = read()
): ProjectHostSetupOption | null {
  const ready = options.filter((option) => option.kind === 'ready')
  const remembered = stored.byProject[projectId]
  return (
    (remembered
      ? ready.find((option) => option.id === remembered.id && option.hostId === remembered.hostId)
      : undefined) ??
    (stored.lastHostId ? ready.find((option) => option.hostId === stored.lastHostId) : undefined) ??
    null
  )
}

/** Once per project the dialog shows: select the recent run target when it differs. */
export function useRecentComposerRunTarget(input: {
  enabled: boolean
  projectId: string | null
  selectedSetupId: string | null
  options: readonly ProjectHostSetupOption[]
  select: (selectionKey: string) => void
}): void {
  const { enabled, projectId, selectedSetupId, options, select } = input
  const appliedRef = useRef(new Set<string>())
  useEffect(() => {
    if (!enabled || !projectId || appliedRef.current.has(projectId) || options.length === 0) {
      return
    }
    appliedRef.current.add(projectId)
    const recent = recentComposerRunTarget(projectId, options)
    if (recent && recent.id !== selectedSetupId) {
      select(getProjectHostSetupSelectionKey(recent))
    }
  }, [enabled, options, projectId, select, selectedSetupId])
}

/** The composer's target state, wired to the hook above. */
export function useRecentComposerRunTargetFor(
  target: {
    composerTargetStore: { initialWorkspaceTarget: unknown }
    runtimeTargetSelection: {
      isProjectGroupTarget: boolean
      selectedRepoProjectId: string | null
      selectedProjectHostSetupId: string | null
      projectHostSetupOptions: readonly ProjectHostSetupOption[]
    }
  },
  select: (selectionKey: string) => void
): void {
  const selection = target.runtimeTargetSelection
  useRecentComposerRunTarget({
    enabled: !target.composerTargetStore.initialWorkspaceTarget && !selection.isProjectGroupTarget,
    projectId: selection.selectedRepoProjectId,
    selectedSetupId: selection.selectedProjectHostSetupId,
    options: selection.projectHostSetupOptions,
    select
  })
}
