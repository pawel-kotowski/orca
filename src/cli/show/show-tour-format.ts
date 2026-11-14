import type { AgentShowResult } from '../../shared/agent-show/agent-show-contract'

type Shown = Extract<AgentShowResult, { ok: true }>

/** `Tour "How files open": step 2 of 5, "Main checks the file" (paused).` plus what went wrong. */
export function formatTourResult(result: Shown): string {
  const tour = result.tour
  if (!tour) {
    return result.detail ?? 'No tour is playing.'
  }
  const lines = [
    `Tour "${tour.title}": step ${tour.step} of ${tour.steps}, "${tour.stepTitle}" (${tour.playing ? 'playing' : 'paused'})${result.visible ? '' : '; not on screen'}.`
  ]
  for (const problem of tour.problems) {
    lines.push(`- ${problem}`)
  }
  return lines.join('\n')
}
