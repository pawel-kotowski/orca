import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import { readRuntimeFileContent } from '@/runtime/files/reads/runtime-file-read-client'
import { buildWorkspaceFileContextForFile } from '@/runtime/files/workspace-file-host-routing'
import { resolveShowRequestFile } from '../code/show-request-file'
import { predictTour, type RangeLineLengths, type StepPrediction } from './tour-fit-prediction'
import { measurePredictionGeometry } from './tour-stage-geometry'
import type { TourStep } from './tour-steps'

// Why 4: Monaco's default tab size; a tab-indented line wraps as that many columns each.
const TAB_COLUMNS = 4

/** Each line's length in columns, per file the tour's code shows; a file that cannot be read is left out. */
async function readLineLengths(
  context: AgentShowContext,
  steps: readonly TourStep[]
): Promise<Map<string, number[]>> {
  const paths = new Set(
    steps.flatMap((step) =>
      step.requests.flatMap((request) => (request.kind === 'code' ? [request.filePath] : []))
    )
  )
  const lengths = new Map<string, number[]>()
  await Promise.all(
    [...paths].map(async (requestPath) => {
      const file = resolveShowRequestFile(context, requestPath)
      if (!file) {
        return
      }
      try {
        const host = buildWorkspaceFileContextForFile(
          context.worktreeId,
          context.worktreePath,
          file.filePath
        )
        const read = await readRuntimeFileContent({
          ...host,
          filePath: file.filePath,
          relativePath: file.relativePath,
          worktreeId: context.worktreeId
        })
        if (!read.isBinary) {
          lengths.set(
            requestPath,
            read.content
              .split('\n')
              .map((line) => line.replaceAll('\t', ' '.repeat(TAB_COLUMNS)).length)
          )
        }
      } catch {
        // Why: an unreadable file is predicted one row per line; the step's real measure still runs.
      }
    })
  )
  return lengths
}

export type TourCheck =
  | { measured: true; steps: StepPrediction[] }
  | { measured: false; reason: string }

/**
 * Every step's fit, predicted from the window as drawn, staging nothing:
 * the screen stays as it is.
 */
export async function checkTour(
  context: AgentShowContext,
  steps: readonly TourStep[]
): Promise<TourCheck> {
  const geometry = measurePredictionGeometry(context)
  if (!geometry) {
    return {
      measured: false,
      reason:
        "the chat's workspace is not on screen, so the stage could not be measured; check again once it is in front"
    }
  }
  const lengths = await readLineLengths(context, steps)
  const rangeLengths: RangeLineLengths = (filePath, startLine, endLine) =>
    lengths.get(filePath)?.slice(startLine - 1, endLine) ?? null
  return { measured: true, steps: predictTour(steps, geometry, rangeLengths) }
}

/** The check's words for the agent: each step's predicted problems, then what it could not foresee. */
export function describeTourCheck(title: string, check: TourCheck): string {
  if (!check.measured) {
    return `Checked "${title}" without showing it, but ${check.reason}.`
  }
  const problems = check.steps.flatMap((step, index) =>
    step.problems.map((problem) => `- step ${index + 1}: ${problem}`)
  )
  const unpredicted = check.steps.flatMap((step, index) =>
    step.unpredicted.length > 0 ? [`step ${index + 1} (${step.unpredicted.join(', ')})`] : []
  )
  return [
    `Checked "${title}" (${check.steps.length} steps) without showing it; the screen did not change.`,
    problems.length === 0
      ? 'Every code range fits.'
      : `Predicted problems:\n${problems.join('\n')}`,
    unpredicted.length === 0
      ? null
      : `Not predicted, measured when the user reaches them: ${unpredicted.join('; ')}.`
  ]
    .filter(Boolean)
    .join('\n')
}
