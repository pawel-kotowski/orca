import { Trash2 } from 'lucide-react'
import { ContextMenuItem, ContextMenuSeparator } from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import {
  createWorktreeContextMenuDeleteIntent,
  deferWorktreeContextMenuDeleteIntent
} from '../sidebar/workspace-actions/context-menu/worktree-context-menu-delete-intent'
import type { AgentPaneThread } from './activity-thread-types'

/**
 * Delete the card's workspace from the activity view. It runs the workspace view's own delete (the
 * same confirmation, unsaved-change checks and descendants prompt); a folder workspace is removed
 * from Orca instead. A project's main checkout cannot be deleted here, as in the workspace view.
 */
export function ActivityThreadDeleteWorkspaceItem({
  thread,
  hasWorkspace
}: {
  thread: AgentPaneThread
  /** False for the floating and standalone workspaces, which have nothing on disk to delete. */
  hasWorkspace: boolean
}): React.JSX.Element | null {
  const scope = parseWorkspaceKey(thread.worktree.id)
  const folderWorkspaceId = scope?.type === 'folder' ? scope.folderWorkspaceId : null
  if (!hasWorkspace || (!folderWorkspaceId && thread.worktree.isMainWorktree)) {
    return null
  }
  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem
        variant="destructive"
        onSelect={() =>
          // Why deferred: the confirmation opens after this menu has closed and released focus.
          deferWorktreeContextMenuDeleteIntent(
            createWorktreeContextMenuDeleteIntent({
              worktree: thread.worktree,
              batchDeleteWorktrees: [],
              isMultiContext: false,
              ...(folderWorkspaceId ? { folderWorkspaceId } : {})
            })
          )
        }
      >
        <Trash2 className="size-3.5" />
        {folderWorkspaceId
          ? translate('auto.components.sidebar.WorktreeContextMenu.250de158fd', 'Remove Workspace')
          : translate(
              'auto.components.activity.ActivityThreadContextMenu.deleteWorkspace',
              'Delete Workspace…'
            )}
      </ContextMenuItem>
    </>
  )
}
