import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeTourStamp } from '../../../shared/agent-show/tour-stamp'
import { loadTour } from './tour-load'

const numbered = (count: number, label = 'line'): string =>
  Array.from({ length: count }, (_, i) => `${label} ${i + 1}`).join('\n')

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString().trim()
}

const TOUR = [
  '# Files',
  '## Entry',
  'The entry.',
  '```orca-show',
  'code src/a.ts --lines 10-12 --mark 1',
  '```',
  '## Helper',
  'The helper.',
  '```orca-show',
  'code src/a.ts --lines 20-22',
  '```',
  '## Other',
  'Elsewhere.',
  '```orca-show',
  'code src/b.ts --lines 1-2',
  'tree src',
  '```'
].join('\n')

describe('loadTour against a stamped commit (real git)', () => {
  let repo: string
  let tour: string

  beforeEach(async () => {
    repo = mkdtempSync(join(tmpdir(), 'orca-tour-git-'))
    git(repo, 'init')
    git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'config', 'user.name', 'Test User')
    await mkdir(join(repo, 'src'))
    writeFileSync(join(repo, 'src/a.ts'), numbered(30))
    writeFileSync(join(repo, 'src/b.ts'), numbered(5, 'b'))
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'Add files')
    tour = writeTourStamp(TOUR, git(repo, 'rev-parse', 'HEAD'))
  })

  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  const load = () =>
    loadTour({ worktreePath: repo, local: true, file: join(repo, 'tour.md'), text: tour })

  it('is fresh while nothing changed, and names the commit', async () => {
    const loaded = await load()
    expect(loaded.problems).toEqual([])
    expect(loaded.commit?.subject).toBe('Add files')
    expect(loaded.steps.map((step) => step.freshness?.state)).toEqual(['fresh', 'fresh', 'fresh'])
  })

  it('plays a range at its new lines after lines were added above it, uncommitted', async () => {
    const lines = numbered(30).split('\n')
    lines.splice(4, 0, 'new 1', 'new 2')
    writeFileSync(join(repo, 'src/a.ts'), lines.join('\n'))
    const loaded = await load()
    expect(loaded.steps[0]!.freshness).toEqual({
      state: 'moved',
      detail: 'src/a.ts 10-12 is now 12-14 (2 lines down)'
    })
    expect(loaded.steps[0]!.requests[0]).toMatchObject({ range: { startLine: 12, endLine: 14 } })
  })

  it('is stale when a line inside the range changed, and plays it as written', async () => {
    const lines = numbered(30).split('\n')
    lines[20] = 'edited'
    writeFileSync(join(repo, 'src/a.ts'), lines.join('\n'))
    const loaded = await load()
    expect(loaded.steps.map((step) => step.freshness?.state)).toEqual(['fresh', 'stale', 'fresh'])
    expect(loaded.steps[1]!.freshness?.staleRequests).toEqual([0])
    expect(loaded.steps[1]!.requests[0]).toMatchObject({ range: { startLine: 20, endLine: 22 } })
  })

  it('follows a file renamed and committed since', async () => {
    await rename(join(repo, 'src/b.ts'), join(repo, 'src/c.ts'))
    git(repo, 'add', '-A')
    git(repo, 'commit', '-m', 'Rename b')
    const loaded = await load()
    expect(loaded.problems).toEqual([])
    expect(loaded.steps[2]!.freshness?.state).toBe('moved')
    expect(loaded.steps[2]!.requests[0]).toMatchObject({ filePath: 'src/c.ts' })
  })

  it('reports a tour without a stamp as not stamped and checks its files as before', async () => {
    tour = TOUR.replace('--lines 20-22', '--lines 29-31')
    const loaded = await load()
    expect(loaded.steps[0]!.freshness).toEqual({ state: 'unstamped' })
    expect(loaded.problems).toEqual([
      'step 2 "Helper": `src/a.ts:29-31`: lines 29-31 run past the end (30 lines)'
    ])
  })

  it('does not check a commit the repository does not have', async () => {
    tour = writeTourStamp(TOUR, 'deadbeefdeadbeef')
    const loaded = await load()
    expect(loaded.steps[0]!.freshness).toEqual({
      state: 'unchecked',
      detail: 'steps not checked: commit deadbee is not in this repository; re-stamp with --stamp'
    })
  })
})
