import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { OrcaRuntimeService } from '../../../orca-runtime'
import type { RpcContext } from '../../core'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../shared/execution-host'
import { AGENT_SHOW_METHODS } from './agent-show'

const snapshot = AGENT_SHOW_METHODS.find((method) => method.name === 'agentShow.tourSnapshot')!
  .handler as (params: unknown, ctx: Partial<RpcContext>) => Promise<unknown>

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: dir, stdio: 'pipe' }).toString().trim()
}

describe('agentShow.tourSnapshot', () => {
  let repo: string
  let oldSha: string
  let runtime: OrcaRuntimeService

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'orca-tour-snapshot-'))
    git(repo, 'init')
    git(repo, 'config', 'user.email', 'test@example.com')
    git(repo, 'config', 'user.name', 'Test User')
    writeFileSync(join(repo, 'a.ts'), 'export const was = 1\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-m', 'old')
    oldSha = git(repo, 'rev-parse', 'HEAD')
    writeFileSync(join(repo, 'a.ts'), 'export const now = 2\n')
    git(repo, 'commit', '-am', 'new')
    runtime = {
      resolveRuntimeFileTarget: async () => ({
        worktree: { id: `r::${repo}`, path: repo },
        executionHostId: LOCAL_EXECUTION_HOST_ID
      })
    } as unknown as OrcaRuntimeService
  })
  afterEach(async () => {
    await rm(repo, { recursive: true, force: true })
  })

  it("returns the file's text at the commit, not a path on the host", async () => {
    const before = await readdir(tmpdir())
    await expect(
      snapshot({ worktree: `path:${repo}`, commit: oldSha, path: 'a.ts' }, { runtime })
    ).resolves.toEqual({ commit: oldSha, path: 'a.ts', text: 'export const was = 1\n' })
    // Why: the host no longer writes a temp copy; the desktop showing the tour writes its own.
    expect((await readdir(tmpdir())).filter((name) => !before.includes(name))).not.toContain(
      'orca-tour-snapshots'
    )
  })

  it('takes an absolute path inside the worktree as its relative path', async () => {
    await expect(
      snapshot({ worktree: `path:${repo}`, commit: oldSha, path: join(repo, 'a.ts') }, { runtime })
    ).resolves.toMatchObject({ path: 'a.ts', text: 'export const was = 1\n' })
  })

  it('fails for a file the commit does not have, and for a path leaving the worktree', async () => {
    await expect(
      snapshot({ worktree: `path:${repo}`, commit: oldSha, path: 'missing.ts' }, { runtime })
    ).rejects.toThrow('not_found')
    await expect(
      snapshot({ worktree: `path:${repo}`, commit: oldSha, path: '../a.ts' }, { runtime })
    ).rejects.toThrow('invalid_argument')
  })
})
