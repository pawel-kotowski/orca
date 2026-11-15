import { describe, expect, it } from 'vitest'
import type { AgentShowTourStageRequest } from './agent-show-contract'
import type { DiffFile } from './tour-diff-hunks'
import { describeTourFreshness, stepFreshness, type StampedView } from './tour-freshness'

function view(
  diffs: DiffFile[],
  options: { notInCommit?: string[]; goneNow?: string[] } = {}
): StampedView {
  return {
    short: 'abc1234',
    diffs,
    inCommit: (path) => !options.notInCommit?.includes(path),
    existsNow: (path) => !options.goneNow?.includes(path)
  }
}

const code = (filePath: string, startLine: number, endLine: number): AgentShowTourStageRequest => ({
  kind: 'code',
  filePath,
  range: { startLine, endLine },
  place: 'beside',
  keepOthers: false
})

const inserted: DiffFile = {
  oldPath: 'src/a.ts',
  newPath: 'src/a.ts',
  hunks: [
    { oldStart: 2, oldCount: 0, newStart: 3, newCount: 3 },
    { oldStart: 30, oldCount: 1, newStart: 33, newCount: 1 }
  ]
}

describe('stepFreshness', () => {
  it('is fresh when no edit touches the file, and plays as written', () => {
    const requests = [code('src/b.ts', 10, 20)]
    expect(stepFreshness(requests, view([inserted]))).toEqual({
      requests,
      freshness: { state: 'fresh' }
    })
  })

  it('plays a moved range at its new lines and says by how much', () => {
    expect(stepFreshness([code('src/a.ts', 10, 20)], view([inserted]))).toEqual({
      requests: [code('src/a.ts', 13, 23)],
      freshness: { state: 'moved', detail: 'src/a.ts 10-20 is now 13-23 (3 lines down)' }
    })
  })

  it('is stale when lines inside a range changed, plays it as written and names the show', () => {
    const requests = [code('src/a.ts', 10, 20), code('src/a.ts', 28, 31)]
    expect(stepFreshness(requests, view([inserted]))).toEqual({
      requests: [code('src/a.ts', 13, 23), code('src/a.ts', 28, 31)],
      freshness: {
        state: 'stale',
        detail:
          'lines 28-31 of src/a.ts changed since abc1234; src/a.ts 10-20 is now 13-23 (3 lines down)',
        staleRequests: [1]
      }
    })
  })

  it('follows a renamed file, and is stale for a deleted one', () => {
    const renamed: DiffFile = { oldPath: 'src/old.ts', newPath: 'src/new.ts', hunks: [] }
    const deleted: DiffFile = { oldPath: 'src/gone.ts', newPath: null, hunks: [] }
    expect(stepFreshness([code('src/old.ts', 4, 8)], view([renamed])).requests).toEqual([
      code('src/new.ts', 4, 8)
    ])
    expect(stepFreshness([code('src/gone.ts', 4, 8)], view([deleted])).freshness).toEqual({
      state: 'stale',
      detail: 'src/gone.ts is gone since abc1234',
      staleRequests: [0]
    })
  })

  it('checks folders and files by whether the path is still there', () => {
    const tree: AgentShowTourStageRequest = {
      kind: 'tree',
      entries: [{ path: 'src/cli' }, { path: 'src/old-dir', label: 'Old' }],
      expand: true,
      dimOthers: false
    }
    expect(stepFreshness([tree], view([], { goneNow: ['src/old-dir'] })).freshness).toEqual({
      state: 'stale',
      detail: 'src/old-dir is gone since abc1234',
      staleRequests: [0]
    })
  })

  it('is stale for a file that was not committed when the tour was stamped', () => {
    expect(
      stepFreshness([code('src/new.ts', 1, 3)], view([], { notInCommit: ['src/new.ts'] })).freshness
        .state
    ).toBe('stale')
  })

  it('does not check page marks', () => {
    const ui: AgentShowTourStageRequest = { kind: 'ui', target: { text: 'Sign in' } }
    expect(stepFreshness([ui], view([])).freshness).toEqual({ state: 'unchecked' })
  })
})

describe('describeTourFreshness', () => {
  it('sums the steps up and names each step that is not fresh', () => {
    expect(
      describeTourFreshness({ sha: 'abc1234def', subject: 'Add tours', committedAt: 1 }, [
        { freshness: { state: 'fresh' } },
        { freshness: { state: 'moved', detail: 'src/a.ts 10-20 is now 13-23 (3 lines down)' } },
        { freshness: { state: 'unchecked' } }
      ])
    ).toEqual([
      'Stamped at abc1234 "Add tours": 1 fresh, 1 moved, 1 not checked.',
      '- step 2 moved: src/a.ts 10-20 is now 13-23 (3 lines down)',
      '- step 3 not checked: page marks cannot be compared with a commit',
      "Moved steps play at their new lines. Run --stamp again to make that the tour's baseline."
    ])
  })

  it('tells how to stamp a tour that has no stamp', () => {
    expect(describeTourFreshness(null, [{}])).toEqual([
      'Not stamped: run `orca show tour <file> --stamp` so later edits to the code are followed.'
    ])
  })
})
