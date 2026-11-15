import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  TOURS_FOLDER,
  type AgentShowTourList
} from '../../../shared/agent-show/agent-show-tour-library'
import { loadTour } from './tour-load'

// Why a cap: a folder of hundreds of tours would make every refresh run git that many times.
const MAX_TOURS = 60

/** The worktree's `docs/tours/*.md`, newest first, each read against today's code. */
export async function listWorktreeTours(
  worktreePath: string,
  local: boolean
): Promise<AgentShowTourList> {
  const folder = join(worktreePath, TOURS_FOLDER)
  const names = await readdir(folder).catch(() => [] as string[])
  const files = await Promise.all(
    names
      .filter((name) => name.toLowerCase().endsWith('.md'))
      .map(async (name) => {
        const file = join(folder, name)
        const info = await stat(file).catch(() => null)
        return info?.isFile() ? { file, modifiedAt: info.mtimeMs } : null
      })
  )
  const newest = files
    .filter((entry) => entry !== null)
    .sort((a, b) => b.modifiedAt - a.modifiedAt)
    .slice(0, MAX_TOURS)
  const tours = await Promise.all(
    newest.map(async ({ file, modifiedAt }) => {
      const text = await readFile(file, 'utf8').catch(() => null)
      return text === null
        ? null
        : { ...(await loadTour({ worktreePath, local, file, text })), modifiedAt }
    })
  )
  return { tours: tours.filter((tour) => tour !== null) }
}
