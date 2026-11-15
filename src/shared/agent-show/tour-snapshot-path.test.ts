import { describe, expect, it } from 'vitest'
import { tourSnapshotOrigin, tourSnapshotPath } from './tour-snapshot-path'

describe('tour snapshot path', () => {
  it('names the copy after the file and the commit, under the temp folder', () => {
    expect(
      tourSnapshotPath('/var/folders/T/', '5106302ebfb2', 'src/cli/show/show-tour-format.ts')
    ).toBe('/var/folders/T/orca-tour-snapshots/5106302/src/cli/show/show-tour-format@5106302.ts')
    expect(tourSnapshotPath('C:\\Temp', '5106302ebf', 'Makefile')).toBe(
      'C:\\Temp\\orca-tour-snapshots\\5106302\\Makefile@5106302'
    )
  })

  it('reads the repo path and commit back, on either separator', () => {
    expect(
      tourSnapshotOrigin(
        '/var/folders/T/orca-tour-snapshots/5106302/src/cli/show/show-tour-format@5106302.ts'
      )
    ).toEqual({ path: 'src/cli/show/show-tour-format.ts', commit: '5106302' })
    expect(tourSnapshotOrigin('C:\\Temp\\orca-tour-snapshots\\5106302\\Makefile@5106302')).toEqual({
      path: 'Makefile',
      commit: '5106302'
    })
  })

  it('is null for any other file', () => {
    expect(tourSnapshotOrigin('/repo/src/a@5106302.ts')).toBeNull()
    expect(tourSnapshotOrigin('/tmp/orca-tour-snapshots/5106302/src/a.ts')).toBeNull()
  })
})
