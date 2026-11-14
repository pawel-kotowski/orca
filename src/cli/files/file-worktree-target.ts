import type { RuntimeWorktreeRecord } from '../../shared/runtime-worktree-contracts'
import { isRuntimePathAbsolute, relativePathInsideRoot } from '../../shared/cross-platform-path'
import { isWslUncPath, parseWslUncPath, toWindowsWslPath } from '../../shared/wsl-paths'
import type { HandlerContext } from '../dispatch/dispatch'
import { RuntimeClientError } from '../runtime/types'
import {
  getOptionalWorktreeSelector,
  resolveCurrentWorktreeSelector
} from '../workspace-selection/workspace-selector'

/** --worktree, or the Orca worktree that holds cwd; remote clients must name it. */
export async function getFileWorktreeSelector({
  flags,
  cwd,
  client
}: HandlerContext): Promise<string> {
  const worktree = flags.get('worktree')
  if (flags.has('worktree') && (typeof worktree !== 'string' || worktree.length === 0)) {
    throw new RuntimeClientError('invalid_argument', 'Missing value for --worktree.')
  }
  const explicit = await getOptionalWorktreeSelector(flags, 'worktree', cwd, client)
  if (explicit) {
    return explicit
  }
  if (client.isRemote) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Remote file commands require --worktree because the client cwd cannot identify a server worktree.'
    )
  }
  return await resolveCurrentWorktreeSelector(cwd, client)
}

// Only UNC roots need Linux-path translation; backslash filenames have no equivalent Windows spelling.
function toWorktreeRootPathFlavor(rootPath: string, cwd: string, path: string): string {
  // Interop may omit WSL_DISTRO_NAME; the launcher's UNC cwd also identifies the caller's distro.
  const distro = process.env.WSL_DISTRO_NAME || parseWslUncPath(cwd)?.distro
  if (
    !distro ||
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    !isWslUncPath(rootPath)
  ) {
    return path
  }
  return toWindowsWslPath(path, distro)
}

/** A path relative to the worktree; absolute paths outside it pass through for the runtime guard. */
export async function resolveFilePath(
  ctx: HandlerContext,
  worktree: string,
  path: string
): Promise<string> {
  if (!isRuntimePathAbsolute(path)) {
    return path
  }
  // Relativize only paths inside the worktree; leave others for the runtime guard.
  const result = await ctx.client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
    worktree
  })

  const rootPath = result.result.worktree.path
  const relativePath = relativePathInsideRoot(
    rootPath,
    toWorktreeRootPathFlavor(rootPath, ctx.cwd, path)
  )
  if (relativePath === '') {
    throw new RuntimeClientError(
      'invalid_argument',
      'The selected worktree root is a directory, not a file-open target.'
    )
  }
  return relativePath ?? path
}
