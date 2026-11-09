import React from 'react'
import { ExternalLink, Inbox, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { observeOffscreenAnimation } from '@/lib/offscreen-animation-pause'
import { translate } from '@/i18n/i18n'
import { FilledBellIcon } from '../sidebar/workspace-card/identity/worktree-card-glyphs'
import { activityThreadStatusId } from './activity-thread-presentation'
import type { AgentPaneThread } from './activity-thread-types'

function SlotButton({
  label,
  onClick,
  className,
  children
}: {
  label: string
  onClick: () => void
  className?: string
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
          className={cn(
            'size-5 p-0 text-muted-foreground hover:bg-accent/80 hover:text-foreground active:scale-95',
            className
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

// Why the state's colour: the ringing bell stands where the status glyph was, so it carries it.
function bellTone(thread: AgentPaneThread): string {
  switch (activityThreadStatusId(thread)) {
    case 'done':
      return 'text-emerald-500'
    case 'failed':
    case 'blocked':
      return 'text-red-500'
    case 'interrupted':
      return 'text-muted-foreground'
    default:
      return 'text-amber-500'
  }
}

/**
 * The card's top-right corner, one slot for three things that never need to show at once
 * (Paweł, 2026-11-09: "arent they mutualy exclusive really? maybe they could use one slot?"):
 * an Inbox card you have not seen rings its bell (click: seen, it stays in the Inbox); a seen one
 * shows its state, which turns into X on hover (click: off to Standing by); every other card shows
 * its state only.
 */
export function ActivityThreadCornerSlot({
  thread,
  inInbox,
  statusIndicator,
  onMarkRead,
  onClear,
  onRestore
}: {
  thread: AgentPaneThread
  inInbox: boolean
  /** Null when the strip above the list hides the status. */
  statusIndicator: React.ReactNode
  onMarkRead: (thread: AgentPaneThread) => void
  onClear?: (thread: AgentPaneThread) => void
  /** Standing by only: the status, which turns into an Inbox button on hover, brings it back. */
  onRestore?: (thread: AgentPaneThread) => void
}): React.JSX.Element | null {
  if (inInbox && thread.unread) {
    return (
      <TooltipProvider delayDuration={800} skipDelayDuration={0}>
        <SlotButton
          label={translate('components.activity.markSeen', 'Mark as seen')}
          onClick={() => onMarkRead(thread)}
        >
          <span ref={observeOffscreenAnimation} className="agent-bell-ring inline-flex">
            <FilledBellIcon className={cn('size-4 shrink-0 drop-shadow-sm', bellTone(thread))} />
          </span>
        </SlotButton>
      </TooltipProvider>
    )
  }
  const action =
    inInbox && onClear !== undefined
      ? {
          label: translate('components.activity.standBy', 'Done with it: move to Standing by'),
          run: () => onClear(thread),
          icon: <X className="size-4" />
        }
      : !inInbox && onRestore !== undefined
        ? {
            label: translate('components.activity.backToInbox', 'Back to the Inbox'),
            run: () => onRestore(thread),
            icon: <Inbox className="size-3.5" />
          }
        : null
  if (!action) {
    return statusIndicator ? <span className="inline-flex shrink-0">{statusIndicator}</span> : null
  }
  return (
    <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
      {statusIndicator ? (
        <span className="inline-flex opacity-0 transition-opacity can-hover:opacity-100 can-hover:group-hover:opacity-0">
          {statusIndicator}
        </span>
      ) : null}
      <TooltipProvider delayDuration={800} skipDelayDuration={0}>
        <SlotButton
          label={action.label}
          onClick={action.run}
          className="absolute inset-0 transition-opacity can-hover:pointer-events-none can-hover:opacity-0 can-hover:group-hover:pointer-events-auto can-hover:group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100"
        >
          {action.icon}
        </SlotButton>
      </TooltipProvider>
    </span>
  )
}

/** Jump to the workspace, on hover; the activity page offers it, the sidebar does not. */
export function ActivityThreadJumpAction({
  thread,
  onJump
}: {
  thread: AgentPaneThread
  onJump: (thread: AgentPaneThread) => void
}): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={800} skipDelayDuration={0}>
      <SlotButton
        label={translate(
          'auto.components.activity.ActivityPrototypePage.4616ea39fd',
          'Jump to workspace'
        )}
        onClick={() => onJump(thread)}
        className="can-hover:invisible can-hover:opacity-0 can-hover:group-hover:visible can-hover:group-hover:opacity-100"
      >
        <ExternalLink className="size-3.5" />
      </SlotButton>
    </TooltipProvider>
  )
}
