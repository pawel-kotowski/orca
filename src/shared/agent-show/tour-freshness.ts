import type {
  AgentShowTourCommit,
  AgentShowTourFreshness,
  AgentShowTourStageRequest
} from './agent-show-contract'
import { mapRangeThroughHunks, type DiffFile, type LineRange } from './tour-diff-hunks'
import { mapRequestTargets, requestTargets, type TourTarget } from './tour-request-targets'

/** What the worktree looks like next to the stamped commit, for the paths a tour points at. */
export type StampedView = {
  short: string
  diffs: readonly DiffFile[]
  inCommit: (path: string) => boolean
  existsNow: (path: string) => boolean
}

export type TargetFreshness =
  | { state: 'fresh' }
  | { state: 'moved'; to: TourTarget; detail: string }
  | { state: 'stale'; detail: string }

const lines = (range: LineRange): string =>
  range.startLine === range.endLine ? `${range.startLine}` : `${range.startLine}-${range.endLine}`

function describeMove(from: TourTarget, to: TourTarget): string {
  const renamed = from.path !== to.path ? ` is now ${to.path}` : ''
  if (!from.range || !to.range) {
    return `${from.path}${renamed}`
  }
  const by = to.range.startLine - from.range.startLine
  const shift =
    by === 0
      ? ''
      : ` (${Math.abs(by)} line${Math.abs(by) === 1 ? '' : 's'} ${by > 0 ? 'down' : 'up'})`
  return `${from.path} ${lines(from.range)}${renamed ? `${renamed} ${lines(to.range)}` : ` is now ${lines(to.range)}`}${shift}`
}

/** One target against the stamped commit: unchanged, moved (play at the new place), or changed. */
export function classifyTarget(target: TourTarget, view: StampedView): TargetFreshness {
  if (!view.inCommit(target.path)) {
    return {
      state: 'stale',
      detail: `${target.path} is not in ${view.short} (it was not committed when the tour was stamped)`
    }
  }
  const diff = view.diffs.find((file) => file.oldPath === target.path)
  const movedTo = diff?.newPath && diff.newPath !== target.path ? diff.newPath : null
  if (!target.range) {
    if (view.existsNow(target.path)) {
      return { state: 'fresh' }
    }
    return movedTo
      ? { state: 'moved', to: { path: movedTo }, detail: describeMove(target, { path: movedTo }) }
      : { state: 'stale', detail: `${target.path} is gone since ${view.short}` }
  }
  if (!diff) {
    return { state: 'fresh' }
  }
  if (!diff.newPath) {
    return { state: 'stale', detail: `${target.path} is gone since ${view.short}` }
  }
  const range = mapRangeThroughHunks(target.range, diff.hunks)
  if (!range) {
    return {
      state: 'stale',
      detail: `lines ${lines(target.range)} of ${target.path} changed since ${view.short}`
    }
  }
  const to = { path: diff.newPath, range }
  if (to.path === target.path && range.startLine === target.range.startLine) {
    return { state: 'fresh' }
  }
  return { state: 'moved', to, detail: describeMove(target, to) }
}

/**
 * A step against the stamped commit: its shows with moved targets played at their new places,
 * and its freshness in words. Stale shows stay as written; the strip offers the old version.
 */
export function stepFreshness(
  requests: readonly AgentShowTourStageRequest[],
  view: StampedView
): { requests: AgentShowTourStageRequest[]; freshness: AgentShowTourFreshness } {
  const moved: string[] = []
  const stale: string[] = []
  const staleRequests: number[] = []
  let checked = false
  const played = requests.map((request, index) => {
    const targets = requestTargets(request)
    checked ||= targets.length > 0
    const results = targets.map((target) => classifyTarget(target, view))
    for (const result of results) {
      if (result.state === 'moved') {
        moved.push(result.detail)
      } else if (result.state === 'stale') {
        stale.push(result.detail)
      }
    }
    if (results.some((result) => result.state === 'stale')) {
      staleRequests.push(index)
      return request
    }
    return mapRequestTargets(request, (target, at) => {
      const result = results[at]!
      return result.state === 'moved' ? result.to : target
    })
  })
  if (stale.length > 0) {
    return {
      requests: played,
      freshness: { state: 'stale', detail: [...stale, ...moved].join('; '), staleRequests }
    }
  }
  if (moved.length > 0) {
    return { requests: played, freshness: { state: 'moved', detail: moved.join('; ') } }
  }
  return { requests: played, freshness: { state: checked ? 'fresh' : 'unchecked' } }
}

export type TourFreshnessCounts = Record<AgentShowTourFreshness['state'], number>

/** How many steps are in each state; a step without freshness counts as not stamped. */
export function tourFreshnessCounts(
  steps: readonly { freshness?: AgentShowTourFreshness }[]
): TourFreshnessCounts {
  const counts: TourFreshnessCounts = { fresh: 0, moved: 0, stale: 0, unchecked: 0, unstamped: 0 }
  for (const step of steps) {
    counts[step.freshness?.state ?? 'unstamped'] += 1
  }
  return counts
}

const STEP_WORDS: Partial<Record<AgentShowTourFreshness['state'], string>> = {
  moved: 'moved',
  stale: 'stale',
  unchecked: 'not checked'
}

/**
 * The tour's freshness for the agent: one summary line, then one line per step that is not
 * fresh, then how to refresh it.
 */
export function describeTourFreshness(
  commit: AgentShowTourCommit | null | undefined,
  steps: readonly { freshness?: AgentShowTourFreshness }[]
): string[] {
  if (!commit) {
    return [
      'Not stamped: run `orca show tour <file> --stamp` so later edits to the code are followed.'
    ]
  }
  const counts = tourFreshnessCounts(steps)
  const parts = [
    `${counts.fresh} fresh`,
    counts.moved ? `${counts.moved} moved` : null,
    counts.stale ? `${counts.stale} stale` : null,
    counts.unchecked ? `${counts.unchecked} not checked` : null
  ].filter(Boolean)
  const subject = commit.subject ? ` "${commit.subject}"` : ''
  const lines = [`Stamped at ${commit.sha.slice(0, 7)}${subject}: ${parts.join(', ')}.`]
  steps.forEach(({ freshness }, index) => {
    const words = freshness ? STEP_WORDS[freshness.state] : undefined
    if (words) {
      const detail =
        freshness?.detail ??
        (freshness?.state === 'unchecked' ? 'page marks cannot be compared with a commit' : '')
      lines.push(`- step ${index + 1} ${words}${detail ? `: ${detail}` : ''}`)
    }
  })
  if (counts.stale || counts.moved) {
    lines.push(
      counts.stale
        ? 'Stale steps play as written; the strip offers the code as it was. To refresh: fix their lines in the tour, then run --stamp again.'
        : "Moved steps play at their new lines. Run --stamp again to make that the tour's baseline."
    )
  }
  return lines
}
