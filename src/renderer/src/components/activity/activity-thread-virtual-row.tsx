import type React from 'react'
import { translate } from '@/i18n/i18n'
import { clearActivityThread, isClearableActivityThread } from './activity-clear-completed'
import { ActivityStatusGroupHeader } from './activity-thread-controls'
import { ActivityThreadContextMenu } from './activity-thread-context-menu'
import { floatingPanelShowsTab } from './activity-thread-actions'
import { ActivityThreadRow } from './activity-thread-row'
import { READ_AGENTS_GROUP_KEY } from './activity-thread-grouping'
import { useActivityHidesWorkbench } from '@/lib/activity-workbench-visibility'
import { useAppStore } from '@/store'
import { useActivityChatPreviewPaneKey } from './activity-chat-preview-host'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityVirtualItemDescriptor } from './activity-thread-virtual-items'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { selectFloatingWorkspacePanelVisible } from '@/store/floating-workspace-panel-selector'

type ContextMenuProps = Parameters<typeof ActivityThreadContextMenu>[0]

export function ActivityThreadVirtualRow({
  item,
  collapsed,
  onToggleGroup,
  selectedPaneKey,
  multiSelectedKeys,
  onSelectThread,
  onOpenThread,
  getContextMenuTargets,
  onJumpToWorkspace,
  onMarkThreadRead,
  onMarkThreadUnread,
  onMarkThreadsRead,
  onMarkThreadsUnread,
  canJumpToWorkspace,
  canMarkThreadUnread,
  compactMode,
  showJumpAction
}: {
  item: ActivityVirtualItemDescriptor
  collapsed: boolean
  onToggleGroup: (groupKey: string) => void
  selectedPaneKey: string | null
  multiSelectedKeys: ReadonlySet<string>
  onSelectThread: Parameters<typeof ActivityThreadRow>[0]['onSelect']
  onOpenThread: ContextMenuProps['onOpen']
  getContextMenuTargets: ContextMenuProps['getTargets']
  onJumpToWorkspace: Parameters<typeof ActivityThreadRow>[0]['onJump']
  onMarkThreadRead: Parameters<typeof ActivityThreadRow>[0]['onMarkRead']
  onMarkThreadUnread: Parameters<typeof ActivityThreadRow>[0]['onMarkUnread']
  onMarkThreadsRead: ContextMenuProps['onMarkManyRead']
  onMarkThreadsUnread: ContextMenuProps['onMarkManyUnread']
  canJumpToWorkspace: (thread: AgentPaneThread) => boolean
  canMarkThreadUnread: (thread: AgentPaneThread) => boolean
  compactMode: boolean
  showJumpAction: boolean
}): React.JSX.Element {
  const hidesTabs = useActivityHidesWorkbench()
  const thread = item.type === 'header' ? null : item.thread
  // Why the store, not the last clicked card: the workspace can change another way (the sidebar,
  // Cmd+J), and the card that looks open must be the one shown. A floating card is shown while the
  // floating panel shows its tab. Null: no active tab is known (a bare test store), so the clicked
  // card stands in, as upstream has it.
  const shownInStore = useAppStore((state): boolean | null => {
    if (thread === null) {
      return false
    }
    if (thread.worktree.id === FLOATING_TERMINAL_WORKTREE_ID) {
      return (
        selectFloatingWorkspacePanelVisible(state) && floatingPanelShowsTab(state, thread.tab.id)
      )
    }
    if (state.activeTabId == null) {
      return null
    }
    return state.activeWorktreeId === thread.worktree.id && state.activeTabId === thread.tab.id
  })
  const previewedPaneKey = useActivityChatPreviewPaneKey()
  if (item.type === 'header') {
    return (
      <div
        role="group"
        aria-label={translate(
          'auto.components.activity.ActivityPrototypePage.a2b4437bfb',
          '{{value0}} activity',
          { value0: item.group.label }
        )}
        // Why: room above each section (Working, Done…) so the breaks read at a glance; more
        // above Other agents, which holds the read and cleared ones apart from the rest.
        className={item.group.key === READ_AGENTS_GROUP_KEY ? 'pb-1 pt-10' : 'pb-1 pt-4'}
      >
        <ActivityStatusGroupHeader
          group={item.group}
          collapsed={collapsed}
          onToggle={() => onToggleGroup(item.group.key)}
        />
      </div>
    )
  }
  const canJump = canJumpToWorkspace(item.thread)
  const isActivePane = item.thread.paneKey === selectedPaneKey
  // Why: with the tabs hidden no workspace card is open (the floating panel is not one of the tabs).
  // Of several agents in one shown tab (split panes), the one last clicked is the open one.
  const clickedInThisTab = selectedPaneKey?.startsWith(`${item.thread.tab.id}:`) ?? false
  const floating = item.thread.worktree.id === FLOATING_TERMINAL_WORKTREE_ID
  const isOpen =
    (floating || !hidesTabs) &&
    (shownInStore === null ? isActivePane : shownInStore && (!clickedInThisTab || isActivePane))
  return (
    <ActivityThreadContextMenu
      thread={item.thread}
      canJump={canJump}
      canMarkUnread={canMarkThreadUnread}
      getTargets={getContextMenuTargets}
      onOpen={onOpenThread}
      onJump={onJumpToWorkspace}
      onMarkRead={onMarkThreadRead}
      onMarkUnread={onMarkThreadUnread}
      onMarkManyRead={onMarkThreadsRead}
      onMarkManyUnread={onMarkThreadsUnread}
    >
      {(menuOpen) => (
        // Wrap the row: stacking two Radix triggers on its hover target would compose their refs.
        <div className="pb-0.5">
          <ActivityThreadRow
            thread={item.thread}
            selected={isOpen}
            previewed={item.thread.paneKey === previewedPaneKey}
            // Why: the card whose workspace was opened is the selection's anchor, not a multi-
            // selection; once its tabs hide it must not take the selected frame instead.
            multiSelected={!isActivePane && multiSelectedKeys.has(item.thread.paneKey)}
            onSelect={onSelectThread}
            onJump={onJumpToWorkspace}
            onMarkRead={onMarkThreadRead}
            onMarkUnread={onMarkThreadUnread}
            onClear={isClearableActivityThread(item.thread) ? clearActivityThread : undefined}
            canJump={canJump}
            compactMode={compactMode}
            disableMarkUnread={!canMarkThreadUnread(item.thread)}
            showJumpAction={showJumpAction}
            previewSuppressed={menuOpen}
          />
        </div>
      )}
    </ActivityThreadContextMenu>
  )
}
