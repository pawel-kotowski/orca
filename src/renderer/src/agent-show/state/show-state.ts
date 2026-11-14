import type { AgentShowHandler } from '../../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store/index'
import { windowShown, worktreeDrawn } from '../window-drawn'
import { codeStateFor } from '../code/show-code'
import { treeMarksFor } from '../tree/show-tree'
import { uiStateFor } from '../ui/show-ui'
import { agentShowLayoutFor, ownerTabIsActive } from './agent-show-layout'

/** What the user sees now, so an agent can check its own `orca show` calls landed. */
export const showState: AgentShowHandler<'state'> = async (_request, context) => {
  const store = useAppStore.getState()
  const layout = agentShowLayoutFor(store, context.worktreeId, context.ownerTabId)
  const worktreeOnScreen = worktreeDrawn(store, context.worktreeId) && windowShown()
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
