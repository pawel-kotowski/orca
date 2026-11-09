// Local (glass build): the Git Graph tab walks every branch, not HEAD alone.
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import { resolveExecutableCommand } from '../../node-cli-command-resolution'
import { loadGitHistoryFromExecutor } from './git-history-execution'

const repositories: string[] = []
const gitBinary = resolveExecutableCommand(process.env.ORCA_TEST_GIT_BINARY ?? 'git')

afterEach(async () => {
  await Promise.all(
    repositories.splice(0).map((repo) => rm(repo, { recursive: true, force: true }))
  )
})

async function createRepository() {
  if (!gitBinary) {
    throw new Error('Git is required for the all-refs history test')
  }
  const repo = await mkdtemp(join(tmpdir(), 'orca-history-all-refs-'))
  repositories.push(repo)
  const emptyConfig = join(repo, 'empty-git-config')
  const emptyHooks = join(repo, 'empty-hooks')
  await writeFile(emptyConfig, '')
  await mkdir(emptyHooks)
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))
  )
  const git = async (args: string[], cwd = repo) => {
    const result = await runProcess({
      program: gitBinary,
      args,
      cwd,
      env: { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig },
      timeoutMs: 10000,
      maxOutputBytes: 1024 * 1024
    })
    if (result.code !== 0 || result.timedOut || result.outputTruncated) {
      throw new Error(`git ${args.join(' ')} failed:\n${result.stderr}`)
    }
    return { stdout: result.stdout }
  }
  await git(['init', '--quiet'])
  await git(['config', 'user.name', 'Graph Fixture'])
  await git(['config', 'user.email', 'graph-fixture@example.test'])
  await git(['config', 'commit.gpgsign', 'false'])
  await git(['config', 'core.hooksPath', emptyHooks])
  await git(['checkout', '-b', 'main'])
  await git(['commit', '--quiet', '--allow-empty', '-m', 'base'])
  await git(['checkout', '-b', 'feature'])
  await git(['commit', '--quiet', '--allow-empty', '-m', 'on feature'])
  await git(['tag', 'v1'])
  await git(['checkout', 'main'])
  await git(['commit', '--quiet', '--allow-empty', '-m', 'on main'])
  return { repo, git }
}

describe('git history over every ref', () => {
  it('lists only HEAD history by default and every branch with allRefs', async () => {
    const { repo, git } = await createRepository()
    const head = await loadGitHistoryFromExecutor(git, repo)
    expect(head.items.map((item) => item.subject).sort()).toEqual(['base', 'on main'])
    expect(head.allRefs).toBeUndefined()

    const all = await loadGitHistoryFromExecutor(git, repo, { allRefs: true })
    expect(all.allRefs).toBe(true)
    expect(all.items.map((item) => item.subject).sort()).toEqual(['base', 'on feature', 'on main'])
    const feature = all.items.find((item) => item.subject === 'on feature')
    expect(feature?.references?.map((ref) => ref.name).sort()).toEqual(['feature', 'v1'])
  })

  it('pages every-ref history with skip', async () => {
    const { repo, git } = await createRepository()
    const first = await loadGitHistoryFromExecutor(git, repo, { allRefs: true, limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.hasMore).toBe(true)
    const rest = await loadGitHistoryFromExecutor(git, repo, { allRefs: true, limit: 2, skip: 2 })
    expect(rest.items).toHaveLength(1)
    expect(rest.hasMore).toBe(false)
  })
})
