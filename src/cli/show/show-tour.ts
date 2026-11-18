import { readFile, writeFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import type { AgentShowRequest, AgentShowResult } from '../../shared/agent-show/agent-show-contract'
import type {
  AgentShowLoadedTour,
  AgentShowTourStampInfo
} from '../../shared/agent-show/agent-show-tour-library'
import { writeTourStamp } from '../../shared/agent-show/tour-stamp'
import type { CommandHandler, HandlerContext } from '../dispatch/dispatch'
import { getOptionalStringFlag } from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/connection/types'
import { getFileWorktreeSelector } from '../files/file-worktree-target'
import { callShowRpc } from './show'
import { showOwnerTabId } from './show-owner-tab'
import { formatTourResult } from './show-tour-format'

const CONTROLS = ['next', 'back', 'play', 'pause', 'stop', 'state'] as const
type Control = (typeof CONTROLS)[number]

function invalidTour(target: string, problems: string[]): RuntimeClientError {
  return new RuntimeClientError(
    'invalid_tour',
    `${target} has ${problems.length} problem${problems.length === 1 ? '' : 's'}:\n- ${problems.join('\n- ')}`
  )
}

/** `--stamp`: writes HEAD into the tour, and says which of its files differ from HEAD on disk. */
async function stampTour(
  ctx: HandlerContext,
  worktree: string,
  target: string,
  file: string,
  text: string
): Promise<void> {
  const response = await ctx.client.call<AgentShowTourStampInfo>('agentShow.tourStamp', {
    worktree,
    text
  })
  const info = response.result
  if (info.problems.length > 0) {
    throw invalidTour(target, info.problems)
  }
  await writeFile(file, writeTourStamp(text, info.sha))
  const short = info.sha.slice(0, 7)
  printResult(response, ctx.json, () =>
    [
      `Stamped ${target} at ${short}${info.subject ? ` "${info.subject}"` : ''}.`,
      info.uncommitted.length > 0
        ? `These files differ from ${short} on disk, so the lines the tour points at may not be ${short}'s; commit them and run --stamp again: ${info.uncommitted.join(', ')}`
        : null
    ]
      .filter(Boolean)
      .join('\n')
  )
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
      await sendTour(ctx, worktree, {
        kind: 'tour',
        action: target as Control,
        play: false,
        check: false
      })
      return
    }
    if (target === 'step') {
      await sendTour(ctx, worktree, {
        kind: 'tour',
        action: 'step',
        step: stepFlag(ctx) ?? 1,
        play: false,
        check: false
      })
      return
    }
    const file = resolvePath(ctx.cwd, target)
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch (error) {
      throw new RuntimeClientError(
        'invalid_argument',
        `${target}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
    if (ctx.flags.get('stamp') === true) {
      await stampTour(ctx, worktree, target, file, text)
      return
    }
    const loaded = (
      await ctx.client.call<AgentShowLoadedTour>('agentShow.tourLoad', { worktree, file, text })
    ).result
    if (loaded.problems.length > 0) {
      throw invalidTour(target, loaded.problems)
    }
    await sendTour(ctx, worktree, {
      kind: 'tour',
      action: 'start',
      tour: { title: loaded.title, file, steps: loaded.steps, commit: loaded.commit },
      step: stepFlag(ctx) ?? 1,
      play: ctx.flags.get('play') === true,
      check: ctx.flags.get('check') === true
    })
  }
}
