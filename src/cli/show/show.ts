import { resolve as resolvePath } from 'node:path'
import type {
  AgentShowRequest,
  AgentShowResult,
  AgentShowTourStageRequest
} from '../../shared/agent-show/agent-show-contract'
import type { AgentShowSnapResult } from '../../shared/agent-show/agent-show-window-relay'
import type { CommandHandler, HandlerContext } from '../dispatch/dispatch'
import { getOptionalStringFlag } from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/types'
import { isRendererUnavailable } from '../files/file-open-call'
import { getFileWorktreeSelector } from '../files/file-worktree-target'
import { resolveShowPath } from './show-path'
import { getClearScope } from './show-request-args'
import { resolveStagePaths, SHOW_STAGE_BUILDERS } from './show-request-build'
import { formatShowResult } from './show-result-format'
import { showOwnerTabId } from './show-owner-tab'

// Why 30s: main waits up to 20s for the window, plus worktree resolution.
const SHOW_TIMEOUT_MS = 30_000

export async function callShowRpc<T>(ctx: HandlerContext, method: string, params: object) {
  try {
    return await ctx.client.call<T>(method, params, { timeoutMs: SHOW_TIMEOUT_MS })
  } catch (error) {
    if (!isRendererUnavailable(error)) {
      throw error
    }
    throw new RuntimeClientError(
      'renderer_unavailable',
      'This Orca server has no app window and no Orca window is connected to it, so there is nothing to show code in.',
      { nextSteps: ['Give the user the path and line range in your reply instead.'] }
    )
  }
}

export type BuildRequest = (ctx: HandlerContext, worktree: string) => Promise<AgentShowRequest>

function showHandler(build: BuildRequest): CommandHandler {
  return async (ctx) => {
    const worktree = await getFileWorktreeSelector(ctx)
    const request = await build(ctx, worktree)
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
    printResult({ ...response, result }, ctx.json, (shown) => formatShowResult(request.kind, shown))
  }
}

/** A staging subcommand: its flags as a request, each path resolved from the shell folder. */
function stageHandler(kind: AgentShowTourStageRequest['kind']): CommandHandler {
  return showHandler((ctx, worktree) =>
    resolveStagePaths(SHOW_STAGE_BUILDERS[kind](ctx.flags), (path) =>
      resolveShowPath(ctx, worktree, path)
    )
  )
}

export const SHOW_HANDLERS: Record<string, CommandHandler> = {
  'show code': stageHandler('code'),
  'show file': stageHandler('file'),
  'show tree': stageHandler('tree'),
  'show ui': stageHandler('ui'),
  'show clear': showHandler(async (ctx) => ({ kind: 'clear', scope: getClearScope(ctx.flags) })),
  'show state': showHandler(async () => ({ kind: 'state' })),
  'show snap': async (ctx) => {
    const out = getOptionalStringFlag(ctx.flags, 'out')
    const response = await callShowRpc<AgentShowSnapResult>(
      ctx,
      'agentShow.snap',
      out ? { outPath: resolvePath(ctx.cwd, out) } : {}
    )
    printResult(
      response,
      ctx.json,
      (shot) => `Saved ${shot.width}x${shot.height} PNG: ${shot.path}`
    )
  }
}
