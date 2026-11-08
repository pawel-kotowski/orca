import React from 'react'
import { Bell, ExternalLink, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { observeOffscreenAnimation } from '@/lib/offscreen-animation-pause'
import { translate } from '@/i18n/i18n'
import { FilledBellIcon } from '../sidebar/workspace-card/identity/worktree-card-glyphs'
import { useActivityCardHiddenParts } from './activity-card-parts'
import type { AgentPaneThread } from './activity-thread-types'

// Why: a button that is not pinned shows only while the pointer is on its card (or it has focus).
const HOVER_ONLY =
  'can-hover:pointer-events-none can-hover:opacity-0 can-hover:group-hover:pointer-events-auto can-hover:group-hover:opacity-100 focus-visible:opacity-100'

function RowAction({
  label,
  onClick,
  pinned,
  keyboardReachable = false,
  disabled = false,
  children
}: {
  label: string
  onClick: () => void
  /** Drawn all the time, not only while the pointer is on the card. */
  pinned: boolean
  // Hover-only actions stay `invisible` so long lists don't gain a tab stop per row.
  keyboardReachable?: boolean
  disabled?: boolean
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-activity-thread-control=""
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          className={cn(
            'size-5 p-0 text-muted-foreground transition-opacity hover:bg-accent/80 hover:text-foreground active:scale-95',
            !pinned && HOVER_ONLY,
            !pinned && !keyboardReachable && 'can-hover:invisible can-hover:group-hover:visible'
          )}
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A card's buttons: jump to the workspace, clear the notification, and the bell (read / unread).
 * The bell and clear are pinned (always drawn) while the "Buttons" card part is on, and show only
 * on hover while it is off (Paweł, 2026-11-08: "make bell and hide notification buttons larger and
 * also switch for their visibility"). Jump always shows on hover only.
 */
export function ActivityThreadRowActions({
  thread,
  canJump,
  disableMarkUnread,
  onJump,
  onMarkRead,
  onMarkUnread,
  onClear
}: {
  thread: AgentPaneThread
  canJump: boolean
  disableMarkUnread: boolean
  onJump: (thread: AgentPaneThread) => void
  onMarkRead: (thread: AgentPaneThread) => void
  onMarkUnread: (thread: AgentPaneThread) => void
  onClear?: (thread: AgentPaneThread) => void
}): React.JSX.Element {
  const pinned = !useActivityCardHiddenParts().includes('buttons')
  const markRead = translate(
    'auto.components.activity.ActivityPrototypePage.markThreadRead',
    'Mark thread as read'
  )
  const markUnread = translate(
    'auto.components.activity.ActivityPrototypePage.59b131fbd9',
    'Mark thread unread'
  )
  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={0}>
      {canJump ? (
        <RowAction
          label={translate(
            'auto.components.activity.ActivityPrototypePage.4616ea39fd',
            'Jump to workspace'
          )}
          pinned={false}
          onClick={() => onJump(thread)}
        >
          <ExternalLink className="size-3.5" />
        </RowAction>
      ) : null}
      {onClear ? (
        <RowAction
          label={translate(
            'auto.components.activity.ActivityThreadRow.clearNotification',
            'Clear notification'
          )}
          pinned={pinned}
          keyboardReachable
          onClick={() => onClear(thread)}
        >
          <X className="size-4" />
        </RowAction>
      ) : null}
      {thread.unread ? (
        <RowAction
          label={markRead}
          pinned={pinned}
          keyboardReachable
          onClick={() => onMarkRead(thread)}
        >
          <span ref={observeOffscreenAnimation} className="agent-bell-ring inline-flex">
            <FilledBellIcon className="size-4 shrink-0 text-amber-500 drop-shadow-sm" />
          </span>
        </RowAction>
      ) : (
        <RowAction
          label={markUnread}
          pinned={pinned}
          keyboardReachable
          disabled={disableMarkUnread}
          onClick={() => onMarkUnread(thread)}
        >
          <Bell className="size-3.5" />
        </RowAction>
      )}
    </TooltipProvider>
  )
}
