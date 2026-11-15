import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import type { AppState } from '@/store/types'
import { treeMarksFor } from '../tree/show-tree'
import type { StageRoom } from './code-stage-room'
import { stageFoldsRightSidebar } from './code-stage-explorer'
import { rememberSidebarFolded } from './code-stage-tabs'

/**
 * Gives the stage the window's width for a tour: the right sidebar folds while this agent shows no
 * tree (unless it shows the Tours panel), and the project list folds only when code would not fit beside the chat otherwise.
 * `clear` opens both again. `measure` takes the width a fold frees, as the DOM has not moved yet.
 */
export function makeRoomForStage(
  state: AppState,
  context: AgentShowContext,
  measure: (extraWidthPx: number) => StageRoom
): StageRoom {
  let freed = 0
  if (
    stageFoldsRightSidebar({
      open: state.rightSidebarOpen,
      tab: state.rightSidebarTab,
      foldersLit: treeMarksFor(context).length > 0
    })
  ) {
    state.setRightSidebarOpen(false)
    rememberSidebarFolded(context, 'right')
    freed += state.rightSidebarWidth
  }
  const room = measure(freed)
  if (room.stageHasRoom || !state.sidebarOpen) {
    return room
  }
  const folded = measure(freed + state.sidebarWidth)
  if (!folded.stageHasRoom) {
    return room
  }
  state.setSidebarOpen(false)
  rememberSidebarFolded(context, 'left')
  return folded
}
