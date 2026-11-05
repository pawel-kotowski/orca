import type React from 'react'
import { translate } from '@/i18n/i18n'
import { clearActivityThread, isClearableActivityThread } from './activity-clear-completed'
import { ActivityStatusGroupHeader } from './activity-thread-controls'
import { ActivityThreadContextMenu } from './activity-thread-context-menu'
import { ActivityThreadRow } from './activity-thread-row'
import { useActivityHidesWorkbench } from '@/lib/activity-workbench-visibility'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityVirtualItemDescriptor } from './activity-thread-virtual-items'

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
  if (item.type === 'header') {
    return (
      <div
        role="group"
        aria-label={translate(
          'auto.components.activity.ActivityPrototypePage.a2b4437bfb',
          '{{value0}} activity',
          { value0: item.group.label }
        )}
        // Why: room above each section (Working, Done…) so the breaks read at a glance.
        className="pb-1 pt-4"
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
  // Why: with the tabs hidden nothing is open, so no card may look selected.
  const isActivePane = item.thread.paneKey === selectedPaneKey
  const isOpen = !hidesTabs && isActivePane
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
