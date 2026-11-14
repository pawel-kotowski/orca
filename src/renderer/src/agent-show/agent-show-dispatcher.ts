import { useAppStore } from '@/store/index'
import { revealWorkspaceSurface } from '@/lib/workspace/activation/workspace-surface-reveal'
import { clearCodeMarks, showCode, showFile } from './code/show-code'
import { clearTreeMarks, showTree } from './tree/show-tree'
import { clearUiMarks, showUi } from './ui/show-ui'
import { showState } from './state/show-state'
import { createAgentShowDispatcher } from './agent-show-routing'

export const dispatchAgentShow = createAgentShowDispatcher({
  code: showCode,
  file: showFile,
  tree: showTree,
  ui: showUi,
  state: showState,
  clearCode: clearCodeMarks,
  clearTree: clearTreeMarks,
  clearUi: clearUiMarks,
  revealWorktree: (worktreeId) => revealWorkspaceSurface(useAppStore.getState(), worktreeId)
})
