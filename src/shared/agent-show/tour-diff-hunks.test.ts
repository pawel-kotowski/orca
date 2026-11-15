import { describe, expect, it } from 'vitest'
import { mapRangeThroughHunks, parseUnifiedDiff } from './tour-diff-hunks'

const range = { startLine: 40, endLine: 62 }

describe('mapRangeThroughHunks', () => {
  it('moves a range down by the lines added above it', () => {
    expect(
      mapRangeThroughHunks(range, [{ oldStart: 10, oldCount: 0, newStart: 11, newCount: 3 }])
    ).toEqual({ startLine: 43, endLine: 65 })
  })

  it('moves a range up by the lines removed above it, and ignores edits below it', () => {
    expect(
      mapRangeThroughHunks(range, [
        { oldStart: 5, oldCount: 4, newStart: 5, newCount: 1 },
        { oldStart: 70, oldCount: 2, newStart: 67, newCount: 9 }
      ])
    ).toEqual({ startLine: 37, endLine: 59 })
  })

  it('is changed when a line inside it was edited or deleted', () => {
    expect(
      mapRangeThroughHunks(range, [{ oldStart: 50, oldCount: 1, newStart: 50, newCount: 1 }])
    ).toBeNull()
    expect(
      mapRangeThroughHunks(range, [{ oldStart: 62, oldCount: 1, newStart: 61, newCount: 0 }])
    ).toBeNull()
  })

  it('is changed when lines were added between its lines, not right after its last', () => {
    expect(
      mapRangeThroughHunks(range, [{ oldStart: 45, oldCount: 0, newStart: 46, newCount: 2 }])
    ).toBeNull()
    expect(
      mapRangeThroughHunks(range, [{ oldStart: 62, oldCount: 0, newStart: 63, newCount: 2 }])
    ).toEqual(range)
    expect(
      mapRangeThroughHunks(range, [{ oldStart: 39, oldCount: 0, newStart: 40, newCount: 2 }])
    ).toEqual({ startLine: 42, endLine: 64 })
  })
})

describe('parseUnifiedDiff', () => {
  it('reads edited, deleted and renamed files with their hunks', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -3,0 +4,2 @@ export function a() {',
      '+one',
      '+two',
      '@@ -20 +22 @@',
      '-old',
      '+new',
      'diff --git a/src/gone.ts b/src/gone.ts',
      'deleted file mode 100644',
      '--- a/src/gone.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      'diff --git a/src/old.ts b/src/new.ts',
      'similarity index 90%',
      'rename from src/old.ts',
      'rename to src/new.ts',
      '--- a/src/old.ts',
      '+++ b/src/new.ts',
      '@@ -1 +1,2 @@',
      'diff --git a/run.sh b/run.sh',
      'old mode 100644',
      'new mode 100755',
      ''
    ].join('\n')
    expect(parseUnifiedDiff(diff)).toEqual([
      {
        oldPath: 'src/a.ts',
        newPath: 'src/a.ts',
        hunks: [
          { oldStart: 3, oldCount: 0, newStart: 4, newCount: 2 },
          { oldStart: 20, oldCount: 1, newStart: 22, newCount: 1 }
        ]
      },
      {
        oldPath: 'src/gone.ts',
        newPath: null,
        hunks: [{ oldStart: 1, oldCount: 2, newStart: 0, newCount: 0 }]
      },
      {
        oldPath: 'src/old.ts',
        newPath: 'src/new.ts',
        hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 2 }]
      },
      { oldPath: 'run.sh', newPath: 'run.sh', hunks: [] }
    ])
  })
})
