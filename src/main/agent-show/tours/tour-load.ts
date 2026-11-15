import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import type {
  AgentShowTourCommit,
  AgentShowTourStageRequest
} from '../../../shared/agent-show/agent-show-contract'
import type { AgentShowLoadedTour } from '../../../shared/agent-show/agent-show-tour-library'
import { stepFreshness, type StampedView } from '../../../shared/agent-show/tour-freshness'
import { requestTargets, tourPaths } from '../../../shared/agent-show/tour-request-targets'
import { compileTour } from '../../../cli/show/show-tour-compile'
import { commitInfo, stampedView } from './tour-git'

/** A path a tour names, worktree-relative; an absolute one must be inside the worktree. */
export function tourPathInWorktree(worktreePath: string, path: string): string {
  if (!isAbsolute(path)) {
    return path
  }
  const inside = relative(worktreePath, path)
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`${path} is not inside the worktree`)
  }
  return inside.split(sep).join('/')
}

/** Why a show cannot play on today's files: its file is gone or its range runs past the end. */
async function targetProblem(
  worktreePath: string,
  request: AgentShowTourStageRequest
): Promise<string | null> {
  if (request.kind !== 'code' && request.kind !== 'file') {
    return null
  }
  const absolute = join(worktreePath, request.filePath)
  const found = await stat(absolute).catch(() => null)
  if (!found) {
    return `${request.filePath} does not exist in the worktree`
  }
  if (request.kind === 'code' && found.isFile()) {
    const lineCount = (await readFile(absolute, 'utf8')).split('\n').length
    if (request.range.endLine > lineCount) {
      return `lines ${request.range.startLine}-${request.range.endLine} run past the end (${lineCount} lines)`
    }
  }
  return null
}

const describeRequest = (request: AgentShowTourStageRequest): string =>
  requestTargets(request)
    .map((target) =>
      target.range
        ? `${target.path}:${target.range.startLine}-${target.range.endLine}`
        : target.path
    )
    .join(' ') || request.kind

/** Freshness needs git and the files on this machine; null says why it cannot be checked. */
async function stampedViewFor(
  worktreePath: string,
  local: boolean,
  stamp: string,
  paths: string[]
): Promise<{ commit: AgentShowTourCommit; view: StampedView | null; note: string | null }> {
  const unknown = { sha: stamp, subject: '', committedAt: null }
  if (!local) {
    return {
      commit: unknown,
      view: null,
      note: 'steps not checked: the worktree is on another host'
    }
  }
  const commit = await commitInfo(worktreePath, stamp)
  if (!commit) {
    return {
      commit: unknown,
      view: null,
      note: `steps not checked: commit ${stamp.slice(0, 7)} is not in this repository; re-stamp with --stamp`
    }
  }
  try {
    return { commit, view: await stampedView(worktreePath, commit, paths), note: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { commit, view: null, note: `steps not checked: git failed (${message})` }
  }
}

/**
 * Reads a tour against today's worktree: compiles it, compares each step with the stamped commit
 * (moved ranges play at their new lines), and lists what keeps it from playing.
 */
export async function loadTour(input: {
  worktreePath: string
  /** The worktree's files are on this machine (git and the file checks can run). */
  local: boolean
  file: string
  text: string
}): Promise<AgentShowLoadedTour> {
  const { worktreePath, local } = input
  const relativePath = (() => {
    try {
      return tourPathInWorktree(worktreePath, input.file)
    } catch {
      return input.file
    }
  })()
  const compiled = compileTour(
    input.text,
    (path) => tourPathInWorktree(worktreePath, path),
    relativePath
  )
  const notes: string[] = []
  const paths = tourPaths(compiled.steps)
  const stamped = compiled.stamp
    ? await stampedViewFor(worktreePath, local, compiled.stamp, paths)
    : null
  if (!compiled.stamp) {
    notes.push('not stamped: run orca show tour <file> --stamp so moved code is followed')
  } else if (stamped?.note) {
    notes.push(stamped.note)
  }
  const problems = [...compiled.problems]
  const steps = await Promise.all(
    compiled.steps.map(async (step, index) => {
      const checked = stamped?.view ? stepFreshness(step.requests, stamped.view) : null
      const requests = checked?.requests ?? step.requests
      const stale = new Set(checked?.freshness.staleRequests ?? [])
      if (local) {
        // Why stale shows are skipped: they play as written on purpose, with the old version offered.
        const found = await Promise.all(
          requests.map((request, at) =>
            stale.has(at) ? null : targetProblem(worktreePath, request)
          )
        )
        found.forEach((problem, at) => {
          if (problem) {
            problems.push(
              `step ${index + 1} "${step.title}": \`${describeRequest(requests[at]!)}\`: ${problem}`
            )
          }
        })
      }
      return {
        ...step,
        requests,
        ...(compiled.stamp
          ? {
              freshness: checked?.freshness ?? {
                state: 'unchecked' as const,
                ...(stamped?.note ? { detail: stamped.note } : {})
              }
            }
          : { freshness: { state: 'unstamped' as const } })
      }
    })
  )
  return {
    title: compiled.title,
    file: input.file,
    relativePath,
    steps,
    commit: stamped?.commit ?? null,
    stamp: compiled.stamp,
    problems,
    notes
  }
}
