import type { AgentShowContext } from '../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store/index'
import { revealWorkspaceSurface } from '@/lib/workspace/activation/workspace-surface-reveal'
import { clearCodeMarks, showCode, showFile } from './code/show-code'
import { clearTreeMarks, showTree } from './tree/show-tree'
import { clearUiMarks, showUi } from './ui/show-ui'
import { showState } from './state/show-state'
import { endTourOf, showTour } from './tour/show-tour'
import { createAgentShowDispatcher } from './agent-show-routing'
import { watchShowOwner } from './agent-show-owner-lifecycle'

const routeAgentShow = createAgentShowDispatcher({
  code: showCode,
  file: showFile,
  tree: showTree,
  ui: showUi,
  state: showState,
  tour: showTour,
  endTour: endTourOf,
  clearCode: clearCodeMarks,
  clearTree: clearTreeMarks,
  clearUi: clearUiMarks,
  revealWorktree: (worktreeId) => revealWorkspaceSurface(useAppStore.getState(), worktreeId)
})

export const clearEverything = (context: AgentShowContext): Promise<unknown> =>
  Promise.all([
    endTourOf(context),
    clearCodeMarks(context),
    clearTreeMarks(context),
    clearUiMarks(context)
  ])

export const dispatchAgentShow: typeof routeAgentShow = (request, context) => {
  watchShowOwner(context, clearEverything)
  return routeAgentShow(request, context)
}
