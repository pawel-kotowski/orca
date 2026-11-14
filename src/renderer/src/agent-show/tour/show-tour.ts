import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowResult
} from '../../../../shared/agent-show/agent-show-contract'
import { ensureTourStrips, tourStripRect } from './TourStripHost'
import {
  endTour,
  setTourPlaying,
  startTour,
  stepTour,
  tourOf,
  type PlayingTour
} from './tour-player'

function tourResult(tour: PlayingTour, detail?: string): AgentShowResult {
  const outcome = tour.outcomes[tour.index]
  return {
    ok: true,
    visible: (outcome?.visible ?? true) && tourStripRect(tour) !== null,
    ...(detail ? { detail } : {}),
    tour: {
      title: tour.title,
      file: tour.file,
      step: tour.index + 1,
      steps: tour.steps.length,
      stepTitle: tour.steps[tour.index]!.title,
      playing: tour.playing,
      problems: outcome?.problems ?? []
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
      play: request.play
    })
    return tourResult(tour)
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
