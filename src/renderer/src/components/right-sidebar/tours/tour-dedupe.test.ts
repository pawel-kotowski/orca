import { describe, expect, it } from 'vitest'
import { dedupeTourGroups } from './tour-dedupe'
import type { ListedTour, TourGroup } from './use-repo-tours'

const tour = (relativePath: string, contentHash?: string, title = 'A tour'): ListedTour =>
  ({
    relativePath,
    contentHash,
    title,
    stamp: null,
    steps: [{ title: 'one' }],
    problems: [],
    notes: [],
    modifiedAt: 0
  }) as unknown as ListedTour

const group = (label: string, tours: ListedTour[] | null, current = false): TourGroup => ({
  worktreeId: `id-${label}`,
  worktreePath: `/w/${label}`,
  label,
  current,
  tours,
  error: null
})

describe('dedupeTourGroups', () => {
  it('lists a tour every workspace has once, under the workspace on screen', () => {
    const shared = 'docs/tours/talking-point.md'
    const out = dedupeTourGroups([
      group('this', [tour(shared, 'h1')], true),
      group('main', [tour(shared, 'h1')]),
      group('other', [tour(shared, 'h1')])
    ])
    expect(out[0].tours?.map((t) => t.relativePath)).toEqual([shared])
    expect(out[0].tours?.[0].alsoIn).toEqual(['main', 'other'])
    expect(out[1].tours).toEqual([])
    expect(out[2].tours).toEqual([])
  })

  it('keeps a copy whose text differs, and a tour at another path', () => {
    const out = dedupeTourGroups([
      group('this', [tour('docs/tours/a.md', 'h1')], true),
      group('main', [tour('docs/tours/a.md', 'h2'), tour('docs/tours/b.md', 'h1')])
    ])
    expect(out[0].tours?.[0].alsoIn).toBeUndefined()
    expect(out[1].tours?.map((t) => `${t.relativePath}:${t.contentHash}`)).toEqual([
      'docs/tours/a.md:h2',
      'docs/tours/b.md:h1'
    ])
  })

  it('claims a tour for the first loaded group when this workspace has not loaded yet', () => {
    const out = dedupeTourGroups([
      group('this', null, true),
      group('main', [tour('docs/tours/a.md', 'h1')]),
      group('other', [tour('docs/tours/a.md', 'h1')])
    ])
    expect(out[0].tours).toBeNull()
    expect(out[1].tours?.[0].alsoIn).toEqual(['other'])
    expect(out[2].tours).toEqual([])
  })

  it('compares title and steps when an older server sends no hash', () => {
    const out = dedupeTourGroups([
      group('this', [tour('docs/tours/a.md')], true),
      group('main', [tour('docs/tours/a.md'), tour('docs/tours/a.md', undefined, 'Edited')])
    ])
    expect(out[1].tours?.map((t) => t.title)).toEqual(['Edited'])
  })
})
