import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowResult
} from '../../../../shared/agent-show/agent-show-contract'
import { ensureTourStrips, tourStripRect } from './TourStripHost'
import { windowShown } from '../window-drawn'
import {
  endTour,
  setTourPlaying,
  startTour,
  stepTour,
  tourOf,
  type PlayingTour
} from './tour-player'

const HIDDEN_WINDOW_PROBLEM =
  'the Orca window is hidden (minimized, on another desktop or covered), so no step could be measured; run it again once Orca is in front'

function tourResult(tour: PlayingTour, detail?: string, everyStep = false): AgentShowResult {
  const outcome = tour.outcomes[tour.index]
  const shown = windowShown()
  // Why: in a hidden window every range reads as off screen; that is the window, not the tour.
  const problems = !shown
    ? [HIDDEN_WINDOW_PROBLEM]
    : everyStep
      ? tour.outcomes.flatMap((stepOutcome, index) =>
          (stepOutcome?.problems ?? []).map((problem) => `step ${index + 1}: ${problem}`)
        )
      : (outcome?.problems ?? [])
  return {
    ok: true,
    visible: shown && (outcome?.visible ?? true) && tourStripRect(tour) !== null,
    ...(detail ? { detail } : {}),
    tour: {
      title: tour.title,
      file: tour.file,
      step: tour.index + 1,
      steps: tour.steps.length,
      stepTitle: tour.steps[tour.index]!.title,
      playing: tour.playing,
      problems
    }
  }
}

const noTour: AgentShowResult = {
  ok: false,
  code: 'no_tour',
  message: 'No tour is playing for your tab; start one with orca show tour <file>.'
}

/** `orca show tour`: starts a tour from the CLI's checked steps, or drives the one playing. */
export const showTour: AgentShowHandler<'tour'> = async (request, context) => {
  if (request.action === 'start') {
    if (!request.tour) {
      return { ok: false, code: 'invalid_argument', message: 'start needs the tour steps' }
    }
    ensureTourStrips()
    const tour = await startTour(context, {
      ...request.tour,
      step: (request.step ?? 1) - 1,
      play: request.play,
      check: request.check
    })
    return tourResult(tour, undefined, request.check)
  }
  const tour = tourOf(context)
  if (!tour) {
    return request.action === 'state' || request.action === 'stop'
      ? { ok: true, visible: false, detail: 'No tour is playing.' }
      : noTour
  }
  switch (request.action) {
    case 'next':
    case 'back':
    case 'step': {
      const moved = await stepTour(context, request.action, request.step)
      return tourResult(tour, moved ? undefined : 'there is no step there; the tour stayed put')
    }
    case 'play':
    case 'pause':
      setTourPlaying(context, request.action === 'play')
      return tourResult(tour)
    case 'stop':
      endTour(context)
      return { ok: true, visible: false, detail: `ended the tour "${tour.title}"` }
    case 'state':
      return tourResult(tour)
  }
}

export function endTourOf(context: AgentShowContext): void {
  endTour(context)
}
