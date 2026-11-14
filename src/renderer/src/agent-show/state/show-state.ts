import type { AgentShowHandler } from '../../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store/index'
import type { AppState } from '@/store/types'
import { selectFloatingWorkspacePanelVisible } from '@/store/workspaces/floating/floating-workspace-panel-selector'
import { isFloatingWorkspaceId } from '../../../../shared/floating-workspace-worktree'
import { codeStateFor } from '../code/show-code'
import { treeMarksFor } from '../tree/show-tree'
import { uiStateFor } from '../ui/show-ui'
import { agentShowLayoutFor, ownerTabIsActive } from './agent-show-layout'

function worktreeDrawn(store: AppState, worktreeId: string): boolean {
  if (isFloatingWorkspaceId(worktreeId)) {
    return selectFloatingWorkspacePanelVisible(store)
  }
  return store.activeView === 'terminal' && store.activeWorktreeId === worktreeId
}

/** What the user sees now, so an agent can check its own `orca show` calls landed. */
export const showState: AgentShowHandler<'state'> = async (_request, context) => {
  const store = useAppStore.getState()
  const layout = agentShowLayoutFor(store, context.worktreeId, context.ownerTabId)
  const worktreeOnScreen =
    worktreeDrawn(store, context.worktreeId) && document.visibilityState === 'visible'
  return {
    ok: true,
    visible: worktreeOnScreen,
    state: {
      worktreeOnScreen,
      layout,
      ownerTabVisible: worktreeOnScreen && ownerTabIsActive(layout, context.ownerTabId),
      editors: codeStateFor(context),
      explorer: {
        open: store.rightSidebarOpen && store.rightSidebarTab === 'explorer',
        highlighted: treeMarksFor(context)
      },
      browser: uiStateFor(context)
    }
  }
}
