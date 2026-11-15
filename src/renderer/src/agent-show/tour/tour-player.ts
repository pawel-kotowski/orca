import type {
  AgentShowContext,
  AgentShowResult,
  AgentShowTourCommit
} from '../../../../shared/agent-show/agent-show-contract'
import { clearCodeMarks, codeStateFor } from '../code/show-code'
import { clearTreeMarks } from '../tree/show-tree'
import { clearUiMarks } from '../ui/show-ui'
import { runShow, runShowAsItWas } from './tour-step-shows'
import { signalAgentShowChange } from '../persistence/agent-show-change-signal'
import { REUSED_PANE_DETAIL } from '../code/code-fit-report'
import { holdStagePane, holdStageWhile } from '../code/code-stage-hold'
import { stagePanesUsedBy } from '../code/code-stage-tabs'
import { windowShown, worktreeDrawn } from '../window-drawn'
import { useAppStore } from '@/store/index'
import type { StepPrediction } from './tour-fit-prediction'
import { describeCut, describeOffScreen, predictionMiss } from './tour-step-problems'
import { findOwnerTour } from './tour-owner-lookup'
import {
  stepEntryClears,
  stepHoldMs,
  stepRequests,
  stepReshapesStage,
  tourTargetStep,
  type TourStep
} from './tour-steps'

export type TourStepOutcome = { visible: boolean; problems: string[] }

export type PlayingTour = {
  context: AgentShowContext
  title: string
  file: string
  steps: TourStep[]
  index: number
  playing: boolean
  /** When auto-play moves on, for the strip's progress bar. */
  advanceAt: number | null
  /** What the last entry of each step showed, for the agent's results. */
  outcomes: (TourStepOutcome | null)[]
  /** Each step's fit as predicted when the tour started, before anything was staged. */
  predictions: StepPrediction[] | null
  /** What a step showed that its prediction missed, shown quietly on the strip. */
  warnings: (string | null)[]
  /** The commit the tour was stamped at; null when it has no stamp. */
  commit: AgentShowTourCommit | null
  /** The current step shows its stale code as it was at `commit`, not as it is now. */
  asItWas: boolean
}

const tours = new Map<string, PlayingTour>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()
let entering: Promise<unknown> = Promise.resolve()
let version = 0

export const tourKey = (context: AgentShowContext): string =>
  `${context.worktreeId}\u0000${context.ownerTabId ?? ''}`

function notify(): void {
  version += 1
  for (const listener of listeners) {
    listener()
  }
  signalAgentShowChange()
}

export function subscribeTours(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Changes whenever any tour does; a stable snapshot for React subscribers. */
export function toursVersion(): number {
  return version
}

export function playingTours(): PlayingTour[] {
  return [...tours.values()]
}

export function tourOf(context: AgentShowContext): PlayingTour | undefined {
  return findOwnerTour(tours, tourKey(context), context.ownerTabId)
}

function describeProblem(
  result: AgentShowResult,
  request: TourStep['requests'][number]
): string | null {
  if (!result.ok) {
    return `${result.code}: ${result.message}`
  }
  if (result.detail?.includes(REUSED_PANE_DETAIL)) {
    return result.detail.slice(result.detail.indexOf(REUSED_PANE_DETAIL))
  }
  if (result.fit && result.fit.linesVisible < result.fit.rangeLines && request.kind === 'code') {
    return describeCut(request, result.fit.linesVisible, result.fit.rangeLines)
  }
  return result.visible ? null : (result.detail ?? 'not on screen')
}

function schedule(tour: PlayingTour): void {
  const key = tourKey(tour.context)
  clearTimeout(timers.get(key))
  timers.delete(key)
  tour.advanceAt = null
  if (!tour.playing) {
    return
  }
  if (tour.index >= tour.steps.length - 1) {
    tour.playing = false
    return
  }
  const hold = stepHoldMs(tour.steps[tour.index]!)
  tour.advanceAt = Date.now() + hold
  timers.set(
    key,
    setTimeout(() => void goToStep(tour.context, tour.index + 1), hold)
  )
}

/** The step's code ranges no editor on screen shows whole, whatever pushed them out. */
function offScreenRanges(step: Pick<TourStep, 'requests'>, context: AgentShowContext): string[] {
  const editors = codeStateFor(context)
  return stepRequests(step).flatMap((request) => {
    if (request.kind !== 'code') {
      return []
    }
    const { startLine, endLine } = request.range
    const shown = editors.some(
      (editor) =>
        (editor.filePath === request.filePath ||
          editor.filePath.endsWith(`/${request.filePath}`)) &&
        editor.visibleRange !== null &&
        editor.visibleRange.startLine <= startLine &&
        editor.visibleRange.endLine >= endLine
    )
    return shown ? [] : [describeOffScreen(request)]
  })
}

/** Stages one step from scratch: clears what it replaces, then runs its shows in order. */
async function enterStep(
  tour: PlayingTour,
  index: number,
  asItWas: boolean
): Promise<TourStepOutcome> {
  const step = tour.steps[index]!
  const context = { ...tour.context, focus: true }
  // Why first: the caption should change on the click, not after the code has been staged.
  tour.index = index
  tour.asItWas = asItWas && tour.commit !== null
  notify()
  const stale = new Set(tour.asItWas ? (step.freshness?.staleRequests ?? []) : [])
  const requests = stepRequests(step)
  const clears = stepEntryClears(step)
  if (clears.code) {
    clearCodeMarks(context)
  }
  if (clears.ui) {
    await clearUiMarks(context)
  }
  if (clears.tree) {
    clearTreeMarks(context)
  }
  const problems: string[] = []
  let visible = true
  // Why one hold for the step: a later show (a split below) resizes the panes an earlier one staged.
  await holdStageWhile(async () => {
    const panes = stagePanesUsedBy(context)
    if (windowShown() && stepReshapesStage(step, panes.length)) {
      panes.forEach(holdStagePane)
    }
    for (const [at, request] of requests.entries()) {
      const result = stale.has(at)
        ? await runShowAsItWas(request, context, tour.commit!.sha)
        : await runShow(request, context)
      const problem = describeProblem(result, request)
      visible &&= result.ok && result.visible
      if (problem) {
        problems.push(problem)
      }
    }
  })
  // Why: an old copy is a different file, so the current file's ranges are not expected on screen.
  problems.push(
    ...offScreenRanges({ requests: requests.filter((_, at) => !stale.has(at)) }, context)
  )
  tour.outcomes[index] = { visible: visible && problems.length === 0, problems }
  const predicted = tour.predictions?.[index]
  // Why drawn only: in a hidden window or another workspace every range reads as off screen.
  const measurable = windowShown() && worktreeDrawn(useAppStore.getState(), context.worktreeId)
  tour.warnings[index] =
    predicted && measurable ? predictionMiss(predicted.problems, problems) : null
  schedule(tour)
  notify()
  return tour.outcomes[index]!
}

/** Moves the owner's tour to `index` once any step being staged has finished. */
export function goToStep(
  context: AgentShowContext,
  index: number,
  asItWas = false
): Promise<TourStepOutcome | null> {
  const run = entering.then(() => {
    const tour = tourOf(context)
    return tour && index >= 0 && index < tour.steps.length ? enterStep(tour, index, asItWas) : null
  })
  entering = run.catch(() => undefined)
  return run
}

export async function startTour(
  context: AgentShowContext,
  input: {
    title: string
    file: string
    steps: TourStep[]
    step: number
    play: boolean
    predictions: StepPrediction[] | null
    commit: AgentShowTourCommit | null
  }
): Promise<PlayingTour> {
  const previous = tourOf(context)
  if (previous) {
    endTour(previous.context)
  }
  stopTimer(context)
  const tour: PlayingTour = {
    context: { ...context, focus: false },
    title: input.title,
    file: input.file,
    steps: input.steps,
    index: 0,
    playing: input.play,
    advanceAt: null,
    outcomes: input.steps.map(() => null),
    predictions: input.predictions,
    warnings: input.steps.map(() => null),
    commit: input.commit,
    asItWas: false
  }
  tours.set(tourKey(context), tour)
  await goToStep(context, Math.min(Math.max(0, input.step), input.steps.length - 1))
  return tour
}

function stopTimer(context: AgentShowContext): void {
  const key = tourKey(context)
  clearTimeout(timers.get(key))
  timers.delete(key)
}

export function setTourPlaying(context: AgentShowContext, playing: boolean): void {
  const tour = tourOf(context)
  if (!tour || tour.playing === playing) {
    return
  }
  tour.playing = playing
  schedule(tour)
  notify()
}

/** The user took over (clicked into the code, typed in the chat): auto-play stops. */
export function pauseAllTours(): void {
  for (const tour of tours.values()) {
    if (tour.playing) {
      setTourPlaying(tour.context, false)
    }
  }
}

export async function stepTour(
  context: AgentShowContext,
  action: 'next' | 'back' | 'step',
  requested?: number
): Promise<TourStepOutcome | null> {
  const tour = tourOf(context)
  if (!tour) {
    return null
  }
  const target = tourTargetStep(action, tour.index, tour.steps.length, requested)
  return target === null ? null : goToStep(tour.context, target)
}

/** Ends exactly this owner's tour in this worktree: a clear from another folder leaves it be. */
export function endTour(context: AgentShowContext): void {
  stopTimer(context)
  if (tours.delete(tourKey(context))) {
    notify()
  }
}

/** Puts back a persisted tour on its step, paused; the marks come back on their own. */
export function restoreTour(
  context: AgentShowContext,
  saved: {
    title: string
    file: string
    steps: TourStep[]
    index: number
    commit?: AgentShowTourCommit | null
  }
): void {
  tours.set(tourKey(context), {
    context: { ...context, focus: false },
    title: saved.title,
    file: saved.file,
    steps: saved.steps,
    index: Math.min(saved.index, saved.steps.length - 1),
    playing: false,
    advanceAt: null,
    outcomes: saved.steps.map(() => null),
    predictions: null,
    warnings: saved.steps.map(() => null),
    commit: saved.commit ?? null,
    asItWas: false
  })
  notify()
}

/** Restages the current step with its stale code as it was at the tour's commit, or as it is now. */
export function showStepAsItWas(
  context: AgentShowContext,
  asItWas: boolean
): Promise<TourStepOutcome | null> {
  const tour = tourOf(context)
  if (!tour || tour.asItWas === asItWas) {
    return Promise.resolve(null)
  }
  setTourPlaying(context, false)
  return goToStep(tour.context, tour.index, asItWas)
}
