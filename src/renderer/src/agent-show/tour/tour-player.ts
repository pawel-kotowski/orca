import type {
  AgentShowContext,
  AgentShowResult
} from '../../../../shared/agent-show/agent-show-contract'
import { clearCodeMarks, showCode, showFile } from '../code/show-code'
import { clearTreeMarks, showTree } from '../tree/show-tree'
import { clearUiMarks, showUi } from '../ui/show-ui'
import { signalAgentShowChange } from '../persistence/agent-show-change-signal'
import {
  stepEntryClears,
  stepHoldMs,
  stepRequests,
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
  return tours.get(tourKey(context))
}

async function runShow(
  request: TourStep['requests'][number],
  context: AgentShowContext
): Promise<AgentShowResult> {
  switch (request.kind) {
    case 'code':
      return showCode(request, context)
    case 'file':
      return showFile(request, context)
    case 'tree':
      return showTree(request, context)
    case 'ui':
      return showUi(request, context)
  }
}

function describeProblem(result: AgentShowResult): string | null {
  if (!result.ok) {
    return `${result.code}: ${result.message}`
  }
  if (result.fit && result.fit.linesVisible < result.fit.rangeLines) {
    return `only ${result.fit.linesVisible} of ${result.fit.rangeLines} lines fit`
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

/** Stages one step from scratch: clears what it replaces, then runs its shows in order. */
async function enterStep(tour: PlayingTour, index: number): Promise<TourStepOutcome> {
  const step = tour.steps[index]!
  const context = { ...tour.context, focus: true }
  // Why first: the caption should change on the click, not after the code has been staged.
  tour.index = index
  notify()
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
  for (const request of stepRequests(step)) {
    const result = await runShow(request, context)
    const problem = describeProblem(result)
    visible &&= result.ok && result.visible
    if (problem) {
      problems.push(problem)
    }
  }
  tour.outcomes[index] = { visible, problems }
  schedule(tour)
  notify()
  return tour.outcomes[index]!
}

/** Moves the owner's tour to `index` once any step being staged has finished. */
export function goToStep(
  context: AgentShowContext,
  index: number
): Promise<TourStepOutcome | null> {
  const run = entering.then(() => {
    const tour = tours.get(tourKey(context))
    return tour && index >= 0 && index < tour.steps.length ? enterStep(tour, index) : null
  })
  entering = run.catch(() => undefined)
  return run
}

export async function startTour(
  context: AgentShowContext,
  input: { title: string; file: string; steps: TourStep[]; step: number; play: boolean }
): Promise<PlayingTour> {
  stopTimer(context)
  const tour: PlayingTour = {
    context: { ...context, focus: false },
    title: input.title,
    file: input.file,
    steps: input.steps,
    index: 0,
    playing: input.play,
    advanceAt: null,
    outcomes: input.steps.map(() => null)
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
  const tour = tours.get(tourKey(context))
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
  const tour = tours.get(tourKey(context))
  if (!tour) {
    return null
  }
  const target = tourTargetStep(action, tour.index, tour.steps.length, requested)
  return target === null ? null : goToStep(context, target)
}

/** Ends the tour; its marks go with `orca show clear`, which calls this. */
export function endTour(context: AgentShowContext): void {
  stopTimer(context)
  if (tours.delete(tourKey(context))) {
    notify()
  }
}

/** Puts back a persisted tour on its step, paused; the marks come back on their own. */
export function restoreTour(
  context: AgentShowContext,
  saved: { title: string; file: string; steps: TourStep[]; index: number }
): void {
  tours.set(tourKey(context), {
    context: { ...context, focus: false },
    title: saved.title,
    file: saved.file,
    steps: saved.steps,
    index: Math.min(saved.index, saved.steps.length - 1),
    playing: false,
    advanceAt: null,
    outcomes: saved.steps.map(() => null)
  })
  notify()
}
