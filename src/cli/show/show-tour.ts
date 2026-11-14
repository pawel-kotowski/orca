import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve as resolvePath } from 'node:path'
import type {
  AgentShowRequest,
  AgentShowResult,
  AgentShowTourStageRequest
} from '../../shared/agent-show/agent-show-contract'
import type { CommandHandler, HandlerContext } from '../dispatch/dispatch'
import { normalizeCommandPositionals, parseArgs, validateCommandAndFlags } from '../arguments/args'
import { getOptionalStringFlag } from '../arguments/flags'
import { specPaths } from '../discovery/command-spec'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/types'
import type { RuntimeWorktreeRecord } from '../../shared/runtime-worktree-contracts'
import { getFileWorktreeSelector } from '../files/file-worktree-target'
import { SHOW_COMMAND_SPECS } from '../specs/show'
import { callShowRpc, SHOW_REQUEST_BUILDERS } from './show'
import { showOwnerTabId } from './show-owner-tab'
import { parseTourFile, type TourFile } from './show-tour-file'
import { formatTourResult } from './show-tour-format'

const STAGE_KINDS = ['code', 'tree', 'file', 'ui'] as const
const CONTROLS = ['next', 'back', 'play', 'pause', 'stop', 'state'] as const
type Control = (typeof CONTROLS)[number]

type TourStepRequest = {
  title: string
  caption: string
  holdMs: number | null
  requests: AgentShowTourStageRequest[]
}

/** One `orca-show` line as the request `orca show <line>` would send, or why it would fail. */
async function buildLine(
  ctx: HandlerContext,
  worktree: string,
  worktreeRoot: string,
  words: string[]
): Promise<AgentShowTourStageRequest> {
  const specs = SHOW_COMMAND_SPECS.filter((spec) =>
    STAGE_KINDS.some((kind) => spec.path[1] === kind)
  )
  const parsed = normalizeCommandPositionals(
    specs,
    parseArgs(['show', ...words], specs.flatMap(specPaths), specs)
  )
  validateCommandAndFlags(specs, parsed)
  const kind = parsed.commandPath[1] as (typeof STAGE_KINDS)[number]
  // Why the worktree root as cwd: a tour replays in any checkout, so its paths are worktree-relative.
  const request = await SHOW_REQUEST_BUILDERS[kind](
    { ...ctx, flags: parsed.flags, cwd: worktreeRoot },
    worktree
  )
  checkLocalFile(request as AgentShowTourStageRequest, worktreeRoot)
  return request as AgentShowTourStageRequest
}

/** A tour fails before it plays when a file is gone or a range runs past its end (code moved). */
function checkLocalFile(request: AgentShowTourStageRequest, worktreeRoot: string): void {
  if ((request.kind !== 'code' && request.kind !== 'file') || !existsSync(worktreeRoot)) {
    // Why the root check: a remote worktree's files are not on this machine to check.
    return
  }
  const absolute = isAbsolute(request.filePath)
    ? request.filePath
    : join(worktreeRoot, request.filePath)
  if (!existsSync(absolute)) {
    throw new Error(`${request.filePath} does not exist in the worktree`)
  }
  if (request.kind === 'code') {
    const lineCount = readFileSync(absolute, 'utf8').split('\n').length
    if (request.range.endLine > lineCount) {
      throw new Error(
        `lines ${request.range.startLine}-${request.range.endLine} run past the end (${lineCount} lines)`
      )
    }
  }
}

/** Every step's requests, or every problem in the file at once so the agent fixes it in one go. */
export async function buildTourSteps(
  ctx: HandlerContext,
  worktree: string,
  worktreeRoot: string,
  tour: TourFile
): Promise<{ steps: TourStepRequest[]; problems: string[] }> {
  const problems: string[] = []
  if (tour.steps.length === 0) {
    problems.push('no steps: give each step a "## Title" heading and an orca-show block')
  }
  const steps: TourStepRequest[] = []
  for (const [index, step] of tour.steps.entries()) {
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
        requests.push(await buildLine(ctx, worktree, worktreeRoot, words))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        problems.push(`${where}: \`${words.join(' ')}\`: ${message}`)
      }
    }
    steps.push({ title: step.title, caption: step.caption, holdMs: step.holdMs, requests })
  }
  return { steps, problems }
}

async function sendTour(
  ctx: HandlerContext,
  worktree: string,
  request: Extract<AgentShowRequest, { kind: 'tour' }>
): Promise<void> {
  const response = await callShowRpc<AgentShowResult>(ctx, 'agentShow.request', {
    worktree,
    request,
    ownerTabId: showOwnerTabId(),
    focus: ctx.flags.get('no-focus') !== true
  })
  const result = response.result
  if (!result.ok) {
    throw new RuntimeClientError(result.code, result.message)
  }
  printResult({ ...response, result }, ctx.json, formatTourResult)
}

function stepFlag(ctx: HandlerContext): number | undefined {
  const raw = getOptionalStringFlag(ctx.flags, 'step')
  if (raw === undefined) {
    return undefined
  }
  const step = Number(raw)
  if (!Number.isInteger(step) || step < 1) {
    throw new RuntimeClientError('invalid_argument', `--step must be a step number, got ${raw}`)
  }
  return step
}

export const SHOW_TOUR_HANDLERS: Record<string, CommandHandler> = {
  'show tour': async (ctx) => {
    const worktree = await getFileWorktreeSelector(ctx)
    const target = getOptionalStringFlag(ctx.flags, 'target')
    if (!target) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Name a tour file, or next, back, play, pause, stop or state.'
      )
    }
    if ((CONTROLS as readonly string[]).includes(target)) {
      await sendTour(ctx, worktree, { kind: 'tour', action: target as Control, play: false })
      return
    }
    if (target === 'step') {
      await sendTour(ctx, worktree, {
        kind: 'tour',
        action: 'step',
        step: stepFlag(ctx) ?? 1,
        play: false
      })
      return
    }
    const file = resolvePath(ctx.cwd, target)
    let tour: TourFile
    try {
      tour = parseTourFile(await readFile(file, 'utf8'))
    } catch (error) {
      throw new RuntimeClientError(
        'invalid_argument',
        `${target}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    const shown = await ctx.client.call<{ worktree: RuntimeWorktreeRecord }>('worktree.show', {
      worktree
    })
    const { steps, problems } = await buildTourSteps(
      ctx,
      worktree,
      shown.result.worktree.path,
      tour
    )
    if (problems.length > 0) {
      throw new RuntimeClientError(
        'invalid_tour',
        `${target} has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n- ${problems.join('\n- ')}`
      )
    }
    await sendTour(ctx, worktree, {
      kind: 'tour',
      action: 'start',
      tour: { title: tour.title || target, file, steps },
      step: stepFlag(ctx) ?? 1,
      play: ctx.flags.get('play') === true
    })
  }
}
