import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { HandlerContext } from '../dispatch/dispatch'
import { resolveFilePath } from '../files/file-worktree-target'

/** A relative path that names a file from the shell's folder means that file; else it is worktree-relative. */
export function pickShowPath(
  path: string,
  cwd: string,
  exists: (absolutePath: string) => boolean
): string {
  if (isAbsolute(path)) {
    return path
  }
  const fromCwd = resolve(cwd, path)
  return exists(fromCwd) ? fromCwd : path
}

/** Why: an agent that `cd`s into a folder and passes `render.js` means the file it can see. */
export function resolveShowPath(
  ctx: HandlerContext,
  worktree: string,
  path: string
): Promise<string> {
  return resolveFilePath(ctx, worktree, pickShowPath(path, ctx.cwd, existsSync))
}
