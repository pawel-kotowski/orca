import type { AgentShowTourStampInfo } from '../../../shared/agent-show/agent-show-tour-library'
import { tourPaths } from '../../../shared/agent-show/tour-request-targets'
import { compileTour } from '../../../cli/show/show-tour-compile'
import { commitInfo, headCommit, uncommittedPaths } from './tour-git'
import { tourPathInWorktree } from './tour-load'

/** The commit a tour should be stamped at (HEAD), and which of its files differ from it on disk. */
export async function tourStampInfo(
  worktreePath: string,
  text: string
): Promise<AgentShowTourStampInfo> {
  const compiled = compileTour(text, (path) => tourPathInWorktree(worktreePath, path), 'tour')
  const sha = await headCommit(worktreePath)
  const commit = await commitInfo(worktreePath, sha)
  const paths = tourPaths(compiled.steps)
  return {
    sha,
    subject: commit?.subject ?? '',
    uncommitted: await uncommittedPaths(worktreePath, paths),
    problems: compiled.problems
  }
}
