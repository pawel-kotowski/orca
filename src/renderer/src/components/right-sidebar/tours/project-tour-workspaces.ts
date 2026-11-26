import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../../shared/execution-host/execution-host'
import type { ProjectHostSetup } from '../../../../../shared/project/project-types'
import type { Worktree } from '../../../../../shared/worktree/types'

/** A workspace whose `docs/tours` the Tours tab reads. */
export type TourWorkspace = {
  /** Worktree ids can repeat across hosts, so the host is part of the key. */
  key: string
  id: string
  path: string
  label: string
  hostId: ExecutionHostId
  runtimeEnvironmentId: string | null
  archived: boolean
  /** The workspace on screen; its tours play here, the others' in theirs. */
  current: boolean
}

type Row = Pick<
  Worktree,
  | 'id'
  | 'path'
  | 'displayName'
  | 'repoId'
  | 'projectId'
  | 'hostId'
  | 'runtimeOwnerEnvironmentId'
  | 'isArchived'
>

function hostOf(row: Row): ExecutionHostId {
  return row.hostId ?? LOCAL_EXECUTION_HOST_ID
}

export function tourWorkspaceKey(row: Pick<Row, 'id'> & { hostId?: ExecutionHostId }): string {
  return `${row.hostId ?? LOCAL_EXECUTION_HOST_ID}\u0000${row.id}`
}

/**
 * Every workspace of the active workspace's project: each repo entry of it on this computer and
 * on paired servers, archived ones too (their folder may still hold tours). The active one first,
 * then the rest in their sidebar order. A row with no project id stands for its repo alone.
 */
export function projectTourWorkspaces(args: {
  active: Row | undefined
  activeHostId?: ExecutionHostId | null
  worktreesByRepo: Readonly<Record<string, readonly Row[]>>
  setups: readonly Pick<ProjectHostSetup, 'repoId' | 'projectId' | 'hostId'>[]
}): TourWorkspace[] {
  const { active } = args
  if (!active) {
    return []
  }
  const projectOf = (row: Row): string =>
    row.projectId ??
    args.setups.find((setup) => setup.repoId === row.repoId && setup.hostId === hostOf(row))
      ?.projectId ??
    `repo:${row.repoId}`
  const activeRow = { ...active, hostId: active.hostId ?? args.activeHostId ?? undefined }
  const project = projectOf(activeRow)
  const activeKey = tourWorkspaceKey(activeRow)
  const seen = new Set<string>([activeKey])
  const others: Row[] = []
  for (const rows of Object.values(args.worktreesByRepo)) {
    for (const row of rows) {
      const key = tourWorkspaceKey(row)
      if (!seen.has(key) && projectOf(row) === project) {
        seen.add(key)
        others.push(row)
      }
    }
  }
  const toWorkspace = (row: Row, current: boolean): TourWorkspace => ({
    key: tourWorkspaceKey(row),
    id: row.id,
    path: row.path,
    label: row.displayName,
    hostId: hostOf(row),
    runtimeEnvironmentId: row.runtimeOwnerEnvironmentId ?? null,
    archived: row.isArchived,
    current
  })
  return [toWorkspace(activeRow, true), ...others.map((row) => toWorkspace(row, false))]
}
