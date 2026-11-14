import { resolve as resolvePath } from 'node:path'
import type { AgentShowRequest, AgentShowResult } from '../../shared/agent-show/agent-show-contract'
import type { AgentShowSnapResult } from '../../shared/agent-show/agent-show-window-relay'
import type { CommandHandler, HandlerContext } from '../dispatch/dispatch'
import {
  getOptionalStringFlag,
  getRepeatedStringFlag,
  getRequiredStringFlag
} from '../arguments/flags'
import { printResult } from '../output/command-result-output'
import { RuntimeClientError } from '../runtime/types'
import { isRendererUnavailable } from '../files/file-open-call'
import { getFileWorktreeSelector, resolveFilePath } from '../files/file-worktree-target'
import {
  getClearScope,
  getPlacement,
  getUiTarget,
  parseCodeRef,
  parseLineRange,
  treeEntriesFor
} from './show-request-args'
import { formatShowResult } from './show-result-format'
import { showOwnerTabId } from './show-owner-tab'

// Why 30s: main waits up to 20s for the window, plus worktree resolution.
const SHOW_TIMEOUT_MS = 30_000

async function callShowRpc<T>(ctx: HandlerContext, method: string, params: object) {
  try {
    return await ctx.client.call<T>(method, params, { timeoutMs: SHOW_TIMEOUT_MS })
  } catch (error) {
    if (!isRendererUnavailable(error)) {
      throw error
    }
    throw new RuntimeClientError(
      'renderer_unavailable',
      'This Orca server has no app window, so there is nothing to show code in.',
      { nextSteps: ['Give the user the path and line range in your reply instead.'] }
    )
  }
}

type BuildRequest = (ctx: HandlerContext, worktree: string) => Promise<AgentShowRequest>

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

type Flags = HandlerContext['flags']

// The contract treats an absent note or mark differently from an empty one.
function noteAndMark(flags: Flags): { note?: string; mark?: string } {
  const note = getOptionalStringFlag(flags, 'note')
  const mark = getOptionalStringFlag(flags, 'mark')
  return { ...(note ? { note } : {}), ...(mark ? { mark } : {}) }
}

export const SHOW_HANDLERS: Record<string, CommandHandler> = {
  'show code': showHandler(async (ctx, worktree) => ({
    kind: 'code',
    filePath: await resolveFilePath(ctx, worktree, getRequiredStringFlag(ctx.flags, 'path')),
    range: parseLineRange(getRequiredStringFlag(ctx.flags, 'lines')),
    ...noteAndMark(ctx.flags),
    place: getPlacement(ctx.flags) ?? 'beside',
    keepOthers: ctx.flags.get('keep') === true
  })),
  'show file': showHandler(async (ctx, worktree) => ({
    kind: 'file',
    filePath: await resolveFilePath(ctx, worktree, getRequiredStringFlag(ctx.flags, 'path')),
    preview: ctx.flags.get('preview') === true,
    place: getPlacement(ctx.flags) ?? 'beside'
  })),
  'show tree': showHandler(async (ctx, worktree) => {
    const typed = getRepeatedStringFlag(ctx.flags, 'path')
    if (typed.length === 0) {
      throw new RuntimeClientError('invalid_argument', 'Name at least one path to show.')
    }
    const entries = treeEntriesFor(typed, getRepeatedStringFlag(ctx.flags, 'label'))
    return {
      kind: 'tree',
      entries: await Promise.all(
        entries.map(async (entry) => ({
          ...entry,
          path: await resolveFilePath(ctx, worktree, entry.path)
        }))
      ),
      expand: ctx.flags.get('no-expand') !== true,
      dimOthers: ctx.flags.get('dim-others') === true
    }
  }),
  'show ui': showHandler(async (ctx, worktree) => {
    const target = getUiTarget(ctx.flags)
    const pageId = getOptionalStringFlag(ctx.flags, 'page')
    const codeRef = getOptionalStringFlag(ctx.flags, 'code')
    const code = codeRef === undefined ? undefined : parseCodeRef(codeRef)
    return {
      kind: 'ui',
      target,
      ...(pageId ? { pageId } : {}),
      ...noteAndMark(ctx.flags),
      ...(code
        ? { code: { ...code, filePath: await resolveFilePath(ctx, worktree, code.filePath) } }
        : {})
    }
  }),
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
