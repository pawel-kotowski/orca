import React, { useMemo } from 'react'
import { AgentTypeIcon } from '@/components/agent/icons/agent-type-icon'
import { formatAgentTypeLabel } from '../../../../shared/agent-status/presentation/agent-type-label'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import '../sidebar/workspace-card/activity/worktree-card-empty-inputs'
import CommentMarkdown from '../sidebar/CommentMarkdown'
import { EventTime, ThreadAgentStateIndicator } from './activity-thread-controls'
import { ActivityThreadHoverCard } from './activity-thread-hover-card'
import { activityThreadRowCopy } from './activity-thread-presentation'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityThreadClickEvent } from './use-activity-thread-selection'
import { useAppStore } from '@/store'
import {
  nativeChatActivityFollowsConversation,
  nativeChatActivityHoverChat
} from '../../../../shared/native-chat/native-chat-appearance-settings'
import { useActivityThreadConversation } from './use-activity-thread-conversation'
import { activityThreadFallbackSummary } from './activity-thread-fallback-summary'
import { ActivityThreadConversationBody } from './activity-thread-conversation-body'
import { activityCardTintStyle, useActivityProjectColor } from './activity-project-color'
import { routeActivityCardClick } from './activity-chat-card-controls'
import { ActivityThreadCornerSlot, ActivityThreadJumpAction } from './activity-thread-row-actions'
import { useActivityInboxFactsContext } from './activity-inbox-facts'
import { useActivityCardHiddenParts } from './activity-card-parts'
import { ActivityThreadWorkers, ActivityWorkerOfTag } from './activity-thread-workers'

// Stable thread/callback identities let memoized rows skip query, selection and grouping updates.
export const ActivityThreadRow = React.memo(function ActivityThreadRow({
  thread,
  selected,
  previewed = false,
  multiSelected = false,
  onSelect,
  onJump,
  onMarkRead,
  onClear,
  onRestore,
  inInbox = false,
  canJump,
  compactMode,
  showJumpAction = true,
  previewSuppressed = false
}: {
  thread: AgentPaneThread
  selected: boolean
  /** Its chat is the one the shared hover window shows. */
  previewed?: boolean
  /** In the multi-selection and not the open row. */
  multiSelected?: boolean
  onSelect: (thread: AgentPaneThread, event: ActivityThreadClickEvent) => void
  onJump: (thread: AgentPaneThread) => void
  onMarkRead: (thread: AgentPaneThread) => void
  onClear?: (thread: AgentPaneThread) => void
  /** Under Standing by: bring it back to the Inbox. */
  onRestore?: (thread: AgentPaneThread) => void
  /** In the Inbox: it may ring its bell and be cleared to Standing by. */
  inInbox?: boolean
  canJump: boolean
  compactMode: boolean
  showJumpAction?: boolean
  previewSuppressed?: boolean
}): React.JSX.Element {
  const t = useTranslate()
  useUiLanguageRevision()
  const rowCopy = activityThreadRowCopy(thread, t)
  const { taskTitle, workspaceLabel } = rowCopy
  // Why: a reach-out is the agent telling you something; it leads the card while it waits.
  const reachOut = useActivityInboxFactsContext().reachingOut.get(thread.paneKey)
  const statusLine = reachOut?.message ?? rowCopy.statusLine
  const statusKind = reachOut ? 'state' : rowCopy.statusKind
  const needsAttention = reachOut !== undefined || rowCopy.needsAttention
  const projectColor = useActivityProjectColor(thread.repo)
  const showMarkdownStatus = statusKind === 'message'
  const agentLabel = formatAgentTypeLabel(thread.agentType)
  const followsConversation = useAppStore((state) =>
    nativeChatActivityFollowsConversation(state.settings)
  )
  const liveConversation = useActivityThreadConversation(thread, followsConversation)
  // Why a fallback: every card follows the same layout, transcript or not.
  const fallbackSummary = useMemo(
    () => (followsConversation ? activityThreadFallbackSummary(thread) : null),
    [followsConversation, thread]
  )
  const conversation = liveConversation ?? (fallbackSummary ? { summary: fallbackSummary } : null)
  const hoverChat = useAppStore((state) => nativeChatActivityHoverChat(state.settings))
  const showsStatus = !useActivityCardHiddenParts().includes('status')
  const actions =
    canJump && showJumpAction ? <ActivityThreadJumpAction thread={thread} onJump={onJump} /> : null
  const corner = (large: boolean): React.JSX.Element | null => (
    <ActivityThreadCornerSlot
      thread={thread}
      inInbox={inInbox}
      statusIndicator={
        showsStatus ? <ThreadAgentStateIndicator thread={thread} large={large} /> : null
      }
      onMarkRead={onMarkRead}
      onClear={onClear}
      onRestore={onRestore}
    />
  )

  const card = (
    <div
      data-current={selected ? 'true' : undefined}
      data-activity-thread-pane-key={thread.paneKey}
      data-worktree-card-surface="true"
      data-worktree-card-active={selected ? 'primary' : undefined}
      // Why (main.css): the open card reads clearly, the one whose chat shows on hover lightly.
      data-activity-card-open={selected && conversation ? '' : undefined}
      data-activity-card-previewed={previewed ? '' : undefined}
      data-worktree-card-selected={multiSelected || undefined}
      onClick={(event) => {
        if (routeActivityCardClick(thread.paneKey, event.currentTarget, event) === 'workspace') {
          onSelect(thread, event)
        }
      }}
      role="listitem"
      aria-label={taskTitle}
      aria-current={selected ? 'true' : undefined}
      // Why: the project's colour tells the cards apart at a glance.
      style={activityCardTintStyle(projectColor)}
      className={cn(
        'group relative flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-transparent text-left transition-[background-color,border-color,opacity,box-shadow] duration-200 outline-none select-none focus-visible:ring-1 focus-visible:ring-ring',
        // Why: a conversation card marks hover with a hairline frame, not a filled highlight.
        conversation
          ? 'px-2.5 py-2 hover:border-border/60'
          : 'px-1.5 py-1.5 worktree-sidebar-card-hover'
      )}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {/* Why: a conversation card shows the state on its top line, not in a column of its own. */}
        {conversation ? null : <span className="mt-0.5 inline-flex shrink-0">{corner(false)}</span>}
        {conversation ? (
          <ActivityThreadConversationBody
            thread={thread}
            conversation={conversation}
            workspaceLabel={workspaceLabel}
            agentLabel={agentLabel}
            compactMode={compactMode}
            attentionLine={needsAttention ? statusLine : null}
            corner={corner(true)}
            actions={actions}
            onActivate={(event) => {
              event.stopPropagation()
              const card = event.currentTarget.closest('[data-activity-thread-pane-key]')
              if (!card || routeActivityCardClick(thread.paneKey, card, event) === 'workspace') {
                onSelect(thread, event)
              }
            }}
          />
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex min-w-0 items-start gap-2">
              {/* Keep the activation target separate from markdown links and row actions. */}
              <button
                type="button"
                aria-label={taskTitle}
                aria-keyshortcuts="Enter Space"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect(thread, event)
                }}
                className={cn(
                  'block min-w-0 flex-1 cursor-pointer text-left text-[13px] leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  compactMode ? 'truncate' : 'line-clamp-2 break-words',
                  thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                )}
              >
                {taskTitle}
              </button>
              <EventTime
                timestamp={thread.latestTimestamp}
                compact
                className="shrink-0 whitespace-nowrap py-0.5 text-xs font-medium text-foreground/60 hover:text-foreground/60"
              />
            </div>

            {statusLine ? (
              showMarkdownStatus ? (
                <CommentMarkdown
                  content={statusLine}
                  className={cn(
                    'min-w-0 break-words text-[13px] leading-5 text-foreground/80',
                    compactMode ? 'line-clamp-2' : 'line-clamp-3',
                    '[&_*]:!m-0 [&_*]:!p-0 [&_br]:hidden [&_ol]:list-none [&_ul]:list-none',
                    // Why: code blocks and tables otherwise render as scroll boxes the line clamp cannot cut.
                    '[&_pre]:!max-h-none [&_pre]:!overflow-visible [&_pre]:!whitespace-normal [&_pre]:!rounded-none [&_pre]:!bg-transparent [&_pre]:![font:inherit] [&_pre_code]:![font:inherit]',
                    '[&_div]:!overflow-visible [&_:is(table,thead,tbody,tr,th,td)]:!inline [&_:is(table,thead,tbody,tr,th,td)]:!align-baseline [&_:is(th,td)]:!border-0 [&_:is(th,td)]:!pr-2 [&_table]:![font:inherit]'
                  )}
                />
              ) : (
                <div
                  className={cn(
                    'min-w-0 break-words text-[13px] leading-5',
                    compactMode ? 'line-clamp-2' : 'line-clamp-3',
                    needsAttention ? 'text-agent-question-text' : 'text-foreground/80'
                  )}
                >
                  {statusLine}
                </div>
              )
            ) : null}

            <div className="flex min-w-0 items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
              <span className="inline-flex shrink-0" title={agentLabel}>
                <AgentTypeIcon agentType={thread.agentType} size={13} />
              </span>
              <span className="min-w-0 flex-1 truncate" title={workspaceLabel}>
                {workspaceLabel}
              </span>
              <ActivityWorkerOfTag thread={thread} />
              {actions}
            </div>
          </div>
        )}
      </div>
      <ActivityThreadWorkers thread={thread} onOpenWorker={onSelect} />
      {/* Fills while the pointer rests; the hover card sets the attribute. Duration = rest minus progress delay. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-2 bottom-0 h-px origin-left scale-x-0 rounded-full bg-muted-foreground/50 group-data-[hover-card-resting]:scale-x-100 group-data-[hover-card-resting]:transition-transform group-data-[hover-card-resting]:duration-400 group-data-[hover-card-resting]:ease-linear motion-reduce:hidden"
      />
    </div>
  )
  // Why: with hover off (the default) nothing opens on hover and a click anywhere opens the
  // workspace. Turned on, hovering shows Orca's own details card, not the live chat (Paweł,
  // 2026-11-09: "bring back main orca hover card behavior there", "keep it switched off").
  if (!hoverChat) {
    return card
  }
  return (
    <ActivityThreadHoverCard
      thread={thread}
      onJumpToWorkspace={onJump}
      canJumpToWorkspace={canJump}
      suppressed={previewSuppressed}
    >
      {card}
    </ActivityThreadHoverCard>
  )
})
