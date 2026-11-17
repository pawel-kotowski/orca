import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { tourSnapshotOrigin } from '../../../shared/agent-show/tour-snapshot-path'
import { writeTourSnapshotFile } from './tour-snapshot-file'

const dirs: string[] = []
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tour-snapshot-file-'))
  dirs.push(dir)
  return dir
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('writeTourSnapshotFile', () => {
  it('writes the text read-only, at a path naming the repo file and commit', async () => {
    const dir = await tempDir()
    const sha = 'abcdef0123456789abcdef0123456789abcdef01'
    const file = await writeTourSnapshotFile(dir, {
      commit: sha,
      path: 'services/ai/models.py',
      text: 'def old(): pass\n'
    })
    expect(await readFile(file, 'utf8')).toBe('def old(): pass\n')
    expect((await stat(file)).mode & 0o222).toBe(0)
    expect(tourSnapshotOrigin(file)).toEqual({ path: 'services/ai/models.py', commit: 'abcdef0' })
  })

  it('writes the same copy again over the read-only one', async () => {
    const dir = await tempDir()
    const snapshot = { commit: 'abcdef0', path: 'a.ts', text: 'one' }
    await writeTourSnapshotFile(dir, snapshot)
    const file = await writeTourSnapshotFile(dir, { ...snapshot, text: 'two' })
    expect(await readFile(file, 'utf8')).toBe('two')
  })

  it('refuses a path that leaves the snapshot folder, or a commit that is not an id', async () => {
    const dir = await tempDir()
    for (const path of ['../x.ts', 'a/../../x.ts', '/etc/passwd', 'a\\b.ts', '']) {
      await expect(
        writeTourSnapshotFile(dir, { commit: 'abcdef0', path, text: '' })
      ).rejects.toThrow('invalid_argument')
    }
    await expect(
      writeTourSnapshotFile(dir, { commit: '../../x', path: 'a.ts', text: '' })
    ).rejects.toThrow('invalid_argument')
  })
})
