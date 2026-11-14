import type { AgentShowRequest } from '../../../../shared/agent-show/agent-show-contract'

/** One tour step as Orca plays it: its words and the shows that stage it. */
export type TourStep = {
  title: string
  caption: string
  holdMs: number | null
  requests: Extract<AgentShowRequest, { kind: 'code' | 'tree' | 'file' | 'ui' }>[]
}

const MIN_HOLD_MS = 6000
const MAX_HOLD_MS = 20000

/** How long auto-play holds a step: enough to read its caption, 6–20 s, unless the file says. */
export function stepHoldMs(step: Pick<TourStep, 'caption' | 'holdMs'>): number {
  if (step.holdMs !== null) {
    return step.holdMs
  }
  return Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, 4000 + 60 * step.caption.length))
}

/**
 * What entering a step clears first, so every step looks the same however it was reached.
 * Code: only when the step shows none (otherwise its first `code` replaces, which keeps the
 * stage's panes instead of closing and reopening them). Page marks always. Folder marks only
 * when the step lights folders itself, so a map's folders stay lit across steps.
 */
export function stepEntryClears(step: Pick<TourStep, 'requests'>): {
  code: boolean
  ui: boolean
  tree: boolean
} {
  const has = (kind: TourStep['requests'][number]['kind']): boolean =>
    step.requests.some((request) => request.kind === kind)
  return { code: !has('code'), ui: true, tree: has('tree') }
}

/** The step's shows as played: its first `code` replaces the last step's code marks. */
export function stepRequests(step: Pick<TourStep, 'requests'>): TourStep['requests'] {
  let firstCode = true
  return step.requests.map((request) => {
    if (request.kind !== 'code' || !firstCode) {
      return request
    }
    firstCode = false
    return { ...request, keepOthers: false }
  })
}

/** The step a control moves to, or null when there is none (Next on the last step). */
export function tourTargetStep(
  action: 'next' | 'back' | 'step',
  current: number,
  count: number,
  requested?: number
): number | null {
  const target =
    action === 'next' ? current + 1 : action === 'back' ? current - 1 : (requested ?? 1) - 1
  return target >= 0 && target < count ? target : null
}
