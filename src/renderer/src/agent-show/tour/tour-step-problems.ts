import { REUSED_PANE_DETAIL } from '../code/code-fit-report'

type CodeShow = { filePath: string; range: { startLine: number; endLine: number }; mark?: string }

/** `mark 2 (src/a.ts:10-20)`, or the range alone when it has no mark. */
export function codeShowLabel(show: CodeShow): string {
  const where = `(${show.filePath}:${show.range.startLine}-${show.range.endLine})`
  return show.mark ? `mark ${show.mark} ${where}` : where
}

export function describeOffScreen(show: CodeShow): string {
  return `${codeShowLabel(show)} is not on screen; split the step or shorten its ranges`
}

export function describeCut(show: CodeShow, linesVisible: number, rangeLines: number): string {
  return `${codeShowLabel(show)}: only ${linesVisible} of ${rangeLines} lines fit`
}

const NARROW_WORDS = 'too narrow for code beside the chat'

export function describeNarrow(show: CodeShow): string {
  return `${codeShowLabel(show)} opens as a background tab: the window is ${NARROW_WORDS}`
}

export function describeReused(show: CodeShow, replacedFile: string): string {
  return `${codeShowLabel(show)}: ${REUSED_PANE_DETAIL} with every range readable, so it replaces the pane showing ${replacedFile}`
}

export type StepProblemKind = 'cut' | 'reused' | 'off-screen' | 'narrow' | 'other'

/** What kind of problem a line names, so a predicted and a measured step can be compared. */
export function stepProblemKind(problem: string): StepProblemKind {
  if (problem.includes(REUSED_PANE_DETAIL)) {
    return 'reused'
  }
  if (problem.includes(NARROW_WORDS)) {
    return 'narrow'
  }
  if (/only \d+ of \d+ lines fit/.test(problem)) {
    return 'cut'
  }
  return problem.includes('is not on screen') ? 'off-screen' : 'other'
}

/**
 * The measured problems the check did not foresee, as a quiet warning; null when the step shows
 * nothing worse than predicted.
 */
export function predictionMiss(
  predicted: readonly string[],
  shown: readonly string[]
): string | null {
  const expected = new Set(predicted.map(stepProblemKind))
  const missed = shown.filter((problem) => !expected.has(stepProblemKind(problem)))
  return missed.length === 0 ? null : `the check did not expect this: ${missed.join('; ')}`
}
