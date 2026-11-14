import type { AgentShowContext } from '../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store/index'
import { revealWorkspaceSurface } from '@/lib/workspace/activation/workspace-surface-reveal'
import { hideFloatingWorkspacePanel } from '@/components/floating-terminal/floating-workspace-panel-reveal'
import { isFloatingWorkspaceId } from '../../../shared/floating-workspace-worktree'
import { clearCodeMarks, showCode, showFile } from './code/show-code'
import { clearTreeMarks, showTree } from './tree/show-tree'
import { clearUiMarks, showUi } from './ui/show-ui'
import { showState } from './state/show-state'
import { endTourOf, showTour } from './tour/show-tour'
import { createAgentShowDispatcher } from './agent-show-routing'
import { watchShowOwner } from './agent-show-owner-lifecycle'
import { WINDOW_HIDDEN_DETAIL, windowShown, worktreeDrawn } from './window-drawn'
import { waitForAppState } from './code/code-view-visibility'

const REVEAL_WAIT_MS = 3000
const REVEAL_SETTLE_MS = 250

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
  revealWorktree: async (worktreeId) => {
    const wasDrawn = worktreeDrawn(useAppStore.getState(), worktreeId)
    if (!isFloatingWorkspaceId(worktreeId)) {
      // Why: the floating panel overlays the stage, so code staged under it is not seen.
      hideFloatingWorkspacePanel(useAppStore.getState())
    }
    revealWorkspaceSurface(useAppStore.getState(), worktreeId)
    if (wasDrawn) {
      return
    }
    // Why: from Activity or another workspace the stage mounts after the switch; staging before
    // that measures empty panes ("each pane holds about 0 lines").
    await waitForAppState(
      (state) => (worktreeDrawn(state, worktreeId) ? true : null),
      REVEAL_WAIT_MS
    )
    await new Promise((resolve) => setTimeout(resolve, REVEAL_SETTLE_MS))
  },
  windowShown,
  windowHiddenDetail: WINDOW_HIDDEN_DETAIL
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
