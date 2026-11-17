import { access } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentShowTourCommit } from '../../../shared/agent-show/agent-show-contract'
import { parseUnifiedDiff, type DiffFile } from '../../../shared/agent-show/tour-diff-hunks'
import type { StampedView } from '../../../shared/agent-show/tour-freshness'
import { gitExecFileAsync } from '../../git/command-runner/git-exec-file'
import { gitReadOptionsForWorktree } from '../../git/command-runner/git-runtime-options'
import { literalPathspec } from '../../git/source-control/git-pathspec'
import { readGitBlobAtOidPath } from '../../git/source-control/git-blob-read'

// Why these flags: the user's diff config (noprefix, external tools, textconv, quoting) must not change what is parsed.
const DIFF_FLAGS = [
  '-c',
  'core.quotePath=false',
  'diff',
  '--no-color',
  '--no-ext-diff',
  '--no-textconv',
  '--find-renames'
]

async function git(worktreePath: string, args: string[]): Promise<string> {
  const { stdout } = await gitExecFileAsync(args, gitReadOptionsForWorktree(worktreePath))
  return stdout
}

const pathspecs = (worktreePath: string, paths: readonly string[]): string[] =>
  paths.map((path) => literalPathspec(path, worktreePath, {}))

export async function headCommit(worktreePath: string): Promise<string> {
  return (await git(worktreePath, ['rev-parse', 'HEAD'])).trim()
}

/** The commit's id, subject and time, or null when this repository does not have it. */
export async function commitInfo(
  worktreePath: string,
  commit: string
): Promise<AgentShowTourCommit | null> {
  try {
    const out = await git(worktreePath, ['log', '-1', '--format=%H%x00%s%x00%ct', commit, '--'])
    const [sha, subject, seconds] = out.trim().split('\0')
    return sha ? { sha, subject: subject ?? '', committedAt: Number(seconds) * 1000 } : null
  } catch {
    return null
  }
}

/** The tour's paths whose worktree contents differ from HEAD (edited, staged or untracked). */
export async function uncommittedPaths(
  worktreePath: string,
  paths: readonly string[]
): Promise<string[]> {
  if (paths.length === 0) {
    return []
  }
  const out = await git(worktreePath, [
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    ...pathspecs(worktreePath, paths)
  ])
  const changed = out
    .split('\0')
    .filter((record) => record.length > 3)
    .map((record) => record.slice(3))
  return paths.filter((path) =>
    changed.some((file) => file === path || file.startsWith(`${path}/`))
  )
}

/** Old paths renamed since `commit`, to the path they have now (`--name-status -M` over the tree). */
async function renamesSince(worktreePath: string, commit: string): Promise<Map<string, string>> {
  const out = await git(worktreePath, [...DIFF_FLAGS, '--name-status', '-z', commit])
  const fields = out.split('\0')
  const renames = new Map<string, string>()
  for (let index = 0; index < fields.length; index += 1) {
    const status = fields[index]!
    if (status.startsWith('R') && index + 2 < fields.length) {
      renames.set(fields[index + 1]!, fields[index + 2]!)
      index += 2
    } else if (status.startsWith('C')) {
      index += 2
    } else if (status) {
      index += 1
    }
  }
  return renames
}

async function filesInCommit(
  worktreePath: string,
  commit: string,
  paths: readonly string[]
): Promise<string[]> {
  const out = await git(worktreePath, [
    'ls-tree',
    '-r',
    '--name-only',
    '-z',
    commit,
    '--',
    ...pathspecs(worktreePath, paths)
  ])
  return out.split('\0').filter(Boolean)
}

const pathExists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

/** The worktree next to `commit` for the tour's paths: the diff, what the commit had, what is there now. */
export async function stampedView(
  worktreePath: string,
  commit: AgentShowTourCommit,
  paths: readonly string[]
): Promise<StampedView> {
  const renames = await renamesSince(worktreePath, commit.sha)
  const followed = [...new Set([...paths, ...paths.flatMap((path) => renames.get(path) ?? [])])]
  const [diffText, committed, existing] = await Promise.all([
    git(worktreePath, [
      ...DIFF_FLAGS,
      '-U0',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      commit.sha,
      '--',
      ...pathspecs(worktreePath, followed)
    ]),
    filesInCommit(worktreePath, commit.sha, paths),
    Promise.all(
      paths.map(async (path) => [path, await pathExists(join(worktreePath, path))] as const)
    )
  ])
  const diffs: DiffFile[] = parseUnifiedDiff(diffText)
  const now = new Map(existing)
  return {
    short: commit.sha.slice(0, 7),
    diffs,
    inCommit: (path) => committed.some((file) => file === path || file.startsWith(`${path}/`)),
    existsNow: (path) => now.get(path) === true
  }
}

// Why a cap: the text crosses one RPC reply to the desktop that shows it (a box's reply is 4 MiB).
const MAX_SNAPSHOT_CHARS = 2_000_000

/** The file's text as it was at `commit`; null when it was not a text file there (or too large). */
export async function readFileTextAtCommit(
  worktreePath: string,
  commit: string,
  path: string
): Promise<string | null> {
  const blob = await readGitBlobAtOidPath(worktreePath, commit, path)
  if (!blob.exists || blob.isBinary || blob.content.length > MAX_SNAPSHOT_CHARS) {
    return null
  }
  return blob.content
}
