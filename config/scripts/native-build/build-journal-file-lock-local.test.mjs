import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildJournalFileLock } from './build-journal-file-lock.mjs'

let outputDir

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'orca-journal-file-lock-build-'))
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(outputDir, { recursive: true, force: true })
})

describe('journal file lock build under rootless Docker', () => {
  const userFor = (rootless) => {
    const run = vi.fn(() => ({ code: 0, stdout: '', stderr: '' }))
    buildJournalFileLock(join(outputDir, 'journal-file-lock'), 'x64', {
      glibcFloor: 'desktop',
      run,
      rootless
    })
    const args = run.mock.calls.map(([call]) => call.args).find((call) => call[0] === 'run')
    return args[args.indexOf('--user') + 1]
  }

  it('runs the compile as container root, which rootless Docker maps to the invoking user', () => {
    expect(userFor(true)).toBe('0:0')
  })

  it('keeps the invoking uid under rootful Docker', () => {
    expect(userFor(false)).toBe(`${process.getuid()}:${process.getgid()}`)
  })
})
