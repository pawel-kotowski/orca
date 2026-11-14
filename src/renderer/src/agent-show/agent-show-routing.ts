import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowRequest,
  AgentShowResult
} from '../../../shared/agent-show/agent-show-contract'

export type AgentShowAreas = {
  code: AgentShowHandler<'code'>
  file: AgentShowHandler<'file'>
  tree: AgentShowHandler<'tree'>
  ui: AgentShowHandler<'ui'>
  state: AgentShowHandler<'state'>
  tour: AgentShowHandler<'tour'>
  clearCode: (context: AgentShowContext) => void | Promise<void>
  clearTree: (context: AgentShowContext) => void | Promise<void>
  clearUi: (context: AgentShowContext) => void | Promise<void>
  /** `clear` with no scope also ends the agent's tour. */
  endTour: (context: AgentShowContext) => void
  /** Switches the window to the worktree; called only when the request asks for focus. */
  revealWorktree: (worktreeId: string) => void
}

type AreaScope = 'code' | 'tree' | 'ui'

async function clearScopes(
  areas: AgentShowAreas,
  scopes: AreaScope[],
  context: AgentShowContext
): Promise<AgentShowResult> {
  const clearers = { code: areas.clearCode, tree: areas.clearTree, ui: areas.clearUi }
  await Promise.all(scopes.map((scope) => clearers[scope](context)))
  return { ok: true, visible: false, detail: scopes.join(', ') }
}

async function route(
  areas: AgentShowAreas,
  request: AgentShowRequest,
  context: AgentShowContext
): Promise<AgentShowResult> {
  // Reading state or clearing marks never moves the user's view.
  if (context.focus && !['state', 'clear', 'tour'].includes(request.kind)) {
    areas.revealWorktree(context.worktreeId)
  }
  switch (request.kind) {
    case 'code':
      return areas.code(request, context)
    case 'file':
      return areas.file(request, context)
    case 'tree':
      return areas.tree(request, context)
    case 'ui':
      return areas.ui(request, context)
    case 'state':
      return areas.state(request, context)
    case 'tour':
      return areas.tour(request, context)
    case 'clear':
      if (request.scope === 'all') {
        areas.endTour(context)
      }
      return clearScopes(
        areas,
        request.scope === 'all' ? ['code', 'tree', 'ui'] : [request.scope],
        context
      )
  }
}

/** Routes one `orca show` request to its area; a throw becomes a result so main always gets an answer. */
export function createAgentShowDispatcher(
  areas: AgentShowAreas
): (request: AgentShowRequest, context: AgentShowContext) => Promise<AgentShowResult> {
  return async (request, context) => {
    try {
      return await route(areas, request, context)
    } catch (error) {
      return {
        ok: false,
        code: 'show_failed',
        message: error instanceof Error ? error.message : String(error)
      }
    }
  }
}
