import { describe, expect, it } from 'vitest'
import { modelShowsFile } from './code-model-file'

describe('modelShowsFile', () => {
  it('matches the file the model was made for, on POSIX and Windows paths', () => {
    expect(modelShowsFile('/repo/src/a.ts', '/repo/src/a.ts')).toBe(true)
    expect(modelShowsFile('/C:/repo/src/a.ts', 'C:\\repo\\src\\a.ts')).toBe(true)
  })

  it('rejects the model of the tab this one replaced in the same editor', () => {
    expect(modelShowsFile('/repo/src/old.ts', '/repo/src/a.ts')).toBe(false)
    expect(modelShowsFile('/repo/src/a.ts.bak', '/repo/src/a.ts')).toBe(false)
  })
})
