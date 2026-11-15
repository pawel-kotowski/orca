import type { AgentShowTourStageRequest } from '../../shared/agent-show/agent-show-contract'
import { mapRequestTargets } from '../../shared/agent-show/tour-request-targets'
import { readTourStamp } from '../../shared/agent-show/tour-stamp'
import { normalizeCommandPositionals, parseArgs, validateCommandAndFlags } from '../arguments/args'
import { specPaths } from '../discovery/command-spec'
import { SHOW_COMMAND_SPECS } from '../specs/show'
import { SHOW_STAGE_BUILDERS } from './show-request-build'
import { parseTourFile } from './show-tour-file'

// Why pure: main compiles the tours it lists with the same grammar the CLI checks them with.

const STAGE_KINDS = ['code', 'tree', 'file', 'ui'] as const
const STAGE_SPECS = SHOW_COMMAND_SPECS.filter((spec) =>
  STAGE_KINDS.some((kind) => spec.path[1] === kind)
)

export type CompiledTourStep = {
  title: string
  caption: string
  holdMs: number | null
  requests: AgentShowTourStageRequest[]
}

export type CompiledTour = {
  title: string
  /** The commit in the tour's stamp line, or null when it has none. */
  stamp: string | null
  steps: CompiledTourStep[]
  /** Every problem at once, so the agent fixes the file in one go. */
  problems: string[]
}

/** One `orca-show` line as the request `orca show <line>` would send, paths as typed. */
export function stageRequestFromWords(words: string[]): AgentShowTourStageRequest {
  const parsed = normalizeCommandPositionals(
    STAGE_SPECS,
    parseArgs(['show', ...words], STAGE_SPECS.flatMap(specPaths), STAGE_SPECS)
  )
  validateCommandAndFlags(STAGE_SPECS, parsed)
  const kind = parsed.commandPath[1] as (typeof STAGE_KINDS)[number]
  return SHOW_STAGE_BUILDERS[kind](parsed.flags)
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * A tour file's steps as shows, or every problem in it. `toWorktreePath` turns a typed path into
 * the worktree-relative one a tour plays (tours replay in any checkout), or throws why it cannot.
 */
export function compileTour(
  text: string,
  toWorktreePath: (path: string) => string,
  fallbackTitle: string
): CompiledTour {
  let parsed: ReturnType<typeof parseTourFile>
  try {
    parsed = parseTourFile(text)
  } catch (error) {
    return { title: fallbackTitle, stamp: null, steps: [], problems: [message(error)] }
  }
  const problems: string[] = []
  if (parsed.steps.length === 0) {
    problems.push('no steps: give each step a "## Title" heading and an orca-show block')
  }
  const steps = parsed.steps.map((step, index) => {
    const where = `step ${index + 1} "${step.title}" (line ${step.line})`
    if (step.commands.length === 0) {
      problems.push(`${where}: no orca-show block`)
    }
    if (!step.caption) {
      problems.push(`${where}: no caption; write 1-3 sentences under the heading`)
    }
    const requests: AgentShowTourStageRequest[] = []
    for (const words of step.commands) {
      try {
        requests.push(
          mapRequestTargets(stageRequestFromWords(words), (target) => ({
            ...target,
            path: toWorktreePath(target.path)
          }))
        )
      } catch (error) {
        problems.push(`${where}: \`${words.join(' ')}\`: ${message(error)}`)
      }
    }
    return { title: step.title, caption: step.caption, holdMs: step.holdMs, requests }
  })
  return { title: parsed.title || fallbackTitle, stamp: readTourStamp(text), steps, problems }
}
