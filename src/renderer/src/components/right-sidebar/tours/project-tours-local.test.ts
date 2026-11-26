import { describe, expect, it } from 'vitest'
import { projectTourWorkspaces } from './project-tour-workspaces'
import { byNewestTour, formatTourTime, tourCreatedAt, tourPlace } from './tour-row-labels'
import { dedupeTourGroups } from './tour-dedupe'
import type { ListedTour, TourGroup } from './use-repo-tours'

type Row = Parameters<typeof projectTourWorkspaces>[0]['worktreesByRepo'][string][number]

const row = (over: Partial<Row> & Pick<Row, 'id' | 'repoId'>): Row => ({
  path: `/w/${over.id}`,
  displayName: over.id,
  isArchived: false,
  ...over
})

// The laptop's repo entry and the box's are two repos of one project (same GitHub identity).
const laptop = row({
  id: 'harness',
  repoId: 'laptop-repo',
  projectId: 'github:o/r',
  hostId: 'local'
})
const laptopOld = row({
  id: 'old',
  repoId: 'laptop-repo',
  projectId: 'github:o/r',
  hostId: 'local',
  isArchived: true
})
const box = row({
  id: 'box-main',
  repoId: 'box-repo',
  projectId: 'github:o/r',
  hostId: 'runtime:robo',
  runtimeOwnerEnvironmentId: 'robo'
})
const other = row({ id: 'elsewhere', repoId: 'x', projectId: 'github:o/other', hostId: 'local' })

describe('projectTourWorkspaces', () => {
  it('lists every workspace of the project on every host, archived too, the active one first', () => {
    const out = projectTourWorkspaces({
      active: box,
      worktreesByRepo: { 'laptop-repo': [laptop, laptopOld], 'box-repo': [box], x: [other] },
      setups: []
    })
    expect(out.map((workspace) => [workspace.id, workspace.hostId, workspace.current])).toEqual([
      ['box-main', 'runtime:robo', true],
      ['harness', 'local', false],
      ['old', 'local', false]
    ])
    expect(out[0].runtimeEnvironmentId).toBe('robo')
    expect(out[2].archived).toBe(true)
  })

  it('keeps the same worktree id on two hosts apart, and lists the active one once', () => {
    const twin = { ...box, hostId: 'local' as const, repoId: 'laptop-repo' }
    const out = projectTourWorkspaces({
      active: box,
      worktreesByRepo: { 'laptop-repo': [twin], 'box-repo': [box] },
      setups: []
    })
    expect(out.map((workspace) => workspace.key)).toEqual([
      'runtime:robo\u0000box-main',
      'local\u0000box-main'
    ])
  })

  it('finds the project of a row without one through its host setup, else stays in its repo', () => {
    const legacy = row({ id: 'legacy', repoId: 'laptop-repo', hostId: 'local' })
    const out = projectTourWorkspaces({
      active: box,
      worktreesByRepo: { 'laptop-repo': [legacy] },
      setups: [{ repoId: 'laptop-repo', hostId: 'local', projectId: 'github:o/r' }]
    })
    expect(out.map((workspace) => workspace.id)).toEqual(['box-main', 'legacy'])
    expect(
      projectTourWorkspaces({
        active: box,
        worktreesByRepo: { 'laptop-repo': [legacy] },
        setups: []
      })
    ).toHaveLength(1)
  })
})

const tour = (over: Partial<ListedTour>): ListedTour => ({
  title: 'A tour',
  file: '/w/docs/tours/a.md',
  relativePath: 'docs/tours/a.md',
  steps: [{ title: 'one', caption: 'one', holdMs: null, requests: [] }],
  commit: undefined,
  stamp: null,
  problems: [],
  notes: [],
  modifiedAt: 3,
  ...over
})

const group = (over: Partial<TourGroup>): TourGroup => ({
  key: 'local\u0000a',
  worktreeId: 'a',
  worktreePath: '/w/a',
  label: 'Ai harness pr stack',
  hostLabel: null,
  archived: false,
  current: false,
  tours: [],
  error: null,
  ...over
})

describe('tour row labels', () => {
  it('names the workspace, archived, and the machine when it is another one', () => {
    expect(tourPlace(group({ hostLabel: 'laptop' }))).toBe('Ai harness pr stack · laptop')
    expect(tourPlace(group({ archived: true }))).toBe('Ai harness pr stack · archived')
  })

  it('dates a tour by its file creation, then its stamp commit, then its last change', () => {
    expect(tourCreatedAt(tour({ createdAt: 10 }))).toEqual({ at: 10, source: 'created' })
    const stamped = tour({ commit: { sha: 'abc', subject: 's', committedAt: 7 } })
    expect(tourCreatedAt(stamped)).toEqual({ at: 7, source: 'stamped' })
    expect(tourCreatedAt(tour({}))).toEqual({ at: 3, source: 'modified' })
  })

  it('shows day, month and time, and the year only when it is not this one', () => {
    const at = new Date(2026, 10, 24, 8, 16).getTime()
    const thisYear = formatTourTime(at, new Date(2026, 11, 1).getTime())
    expect(thisYear).toMatch(/24/)
    expect(thisYear).toMatch(/08:16|8:16/)
    expect(thisYear).not.toMatch(/2026/)
    expect(formatTourTime(at, new Date(2027, 0, 2).getTime())).toMatch(/2026/)
  })

  it('sorts newest first', () => {
    const rows = [{ tour: tour({ createdAt: 1 }) }, { tour: tour({ createdAt: 5 }) }]
    expect(rows.sort(byNewestTour).map((entry) => entry.tour.createdAt)).toEqual([5, 1])
  })

  it('says where else a copy is with its machine', () => {
    const shared = tour({ contentHash: 'h' })
    const out = dedupeTourGroups([
      group({ key: 'k1', current: true, label: 'main', tours: [shared] }),
      group({ key: 'k2', hostLabel: 'laptop', tours: [shared] })
    ])
    expect(out[0].tours?.[0].alsoIn).toEqual(['Ai harness pr stack · laptop'])
    expect(out[1].tours).toEqual([])
  })
})
