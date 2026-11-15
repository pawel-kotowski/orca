import { describe, expect, it } from 'vitest'
import { tourSnapshotRepoPaths } from './tour-snapshot-tab'

const snapshot =
  '/var/folders/T/orca-tour-snapshots/5106302/src/cli/show/show-tour-format@5106302.ts'

describe('tourSnapshotRepoPaths', () => {
  it("gives an as-it-was tab's repo file, absolute in its worktree and relative", () => {
    expect(tourSnapshotRepoPaths({ filePath: snapshot, readOnly: true }, '/repo')).toEqual({
      absolute: '/repo/src/cli/show/show-tour-format.ts',
      relative: 'src/cli/show/show-tour-format.ts'
    })
  })

  it('is null for an editable tab, even at a snapshot-looking path, and for other files', () => {
    expect(tourSnapshotRepoPaths({ filePath: snapshot }, '/repo')).toBeNull()
    expect(
      tourSnapshotRepoPaths({ filePath: '/repo/src/a.ts', readOnly: true }, '/repo')
    ).toBeNull()
  })
})
