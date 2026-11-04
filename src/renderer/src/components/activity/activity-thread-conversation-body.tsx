import type { ReactNode } from 'react'
import { AgentTypeIcon } from '@/lib/agent-type-icon'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import CommentMarkdown from '../sidebar/CommentMarkdown'
import { EventTime } from './activity-thread-controls'
import type { AgentPaneThread } from './activity-thread-types'
import type { ActivityThreadConversation } from './use-activity-thread-conversation'
import { useAgentRowConversationName } from '../dashboard/use-agent-row-conversation-name'
import type { DashboardAgentRow } from '../dashboard/useDashboardData'

const PROMPT_CLASS = 'min-w-0 break-words text-left text-[13px] leading-5 text-foreground'

/**
 * An activity card read from its conversation, top to bottom: where it runs, what it was asked
 * first and last, the latest turn's steps as the chat names them, and the answer once done.
 */
export function ActivityThreadConversationBody({
  thread,
  conversation,
  workspaceLabel,
  agentLabel,
  compactMode,
  attentionLine,
  actions,
  onActivate
}: {
  thread: AgentPaneThread
  conversation: ActivityThreadConversation
  workspaceLabel: string
  agentLabel: string
  compactMode: boolean
  /** What the agent waits on (a question, a permission); it replaces the steps. */
  attentionLine: string | null
  actions: ReactNode
  onActivate: (event: React.MouseEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const { firstPrompt, lastPrompt, steps, finalAnswer } = conversation.summary
  // Why: the same conversation name the normal view's agent row shows (custom, generated or the
  // agent's own terminal title), so a card and its row read alike.
  const conversationName = useAgentRowConversationName({
    entry: thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry ?? {},
    rowSource: 'live',
    tab: thread.tab,
    paneKey: thread.paneKey,
    agentType: thread.agentType
  } as unknown as DashboardAgentRow)
  const clamp = compactMode ? 'line-clamp-1' : 'line-clamp-2'
  const showsBothPrompts = firstPrompt !== null && lastPrompt !== null && lastPrompt !== firstPrompt
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      {/* Why: the same order as the workspace view's card, so the two views match at a glance:
          the workspace name leads, then its repo and branch, then the agent's conversation name. */}
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[14px] leading-5 text-foreground',
            thread.unread ? 'font-bold' : 'font-semibold'
          )}
          title={workspaceLabel}
        >
          {workspaceLabel}
        </span>
        <EventTime
          timestamp={thread.latestTimestamp}
          compact
          className="shrink-0 whitespace-nowrap text-xs font-medium text-foreground/60 hover:text-foreground/60"
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        {thread.repo?.displayName ? (
          <span
            className="max-w-[50%] shrink-0 truncate rounded border border-border/70 bg-muted/70 px-1 font-medium leading-4 text-foreground/85"
            title={thread.repo.displayName}
          >
            {thread.repo.displayName}
          </span>
        ) : null}
        {thread.worktree.branch && thread.worktree.branch !== workspaceLabel ? (
          <span className="min-w-0 flex-1 truncate" title={thread.worktree.branch}>
            {thread.worktree.branch.replace(/^refs\/heads\//, '')}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {actions}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="inline-flex shrink-0" title={agentLabel}>
          <AgentTypeIcon agentType={thread.agentType} size={13} />
        </span>
        <span
          className="min-w-0 truncate text-[13px] font-medium leading-5 text-foreground/90"
          title={conversationName ?? agentLabel}
        >
          {conversationName ?? agentLabel}
        </span>
      </div>
      {/* Why: the first and latest prompt each sit on their own labeled row, so both read at a glance. */}
      <div className="mt-0.5 flex min-w-0 flex-col gap-1">
        <PromptRow
          label={showsBothPrompts ? translate('components.activity.prompt.first', 'first') : null}
        >
          <button
            type="button"
            aria-keyshortcuts="Enter Space"
            onClick={onActivate}
            className={cn(
              PROMPT_CLASS,
              clamp,
              'cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-ring',
              thread.unread ? 'font-medium' : 'font-normal'
            )}
          >
            {firstPrompt ?? lastPrompt ?? workspaceLabel}
          </button>
        </PromptRow>
        {showsBothPrompts ? (
          <PromptRow label={translate('components.activity.prompt.latest', 'latest')}>
            <div className={cn(PROMPT_CLASS, clamp, thread.unread ? 'font-medium' : 'font-normal')}>
              {lastPrompt}
            </div>
          </PromptRow>
        ) : null}
      </div>
      {attentionLine ? (
        <div
          className={cn(
            'min-w-0 break-words text-[13px] leading-5 text-agent-question-text',
            clamp
          )}
        >
          {attentionLine}
        </div>
      ) : (
        steps.map((step, index) => (
          <div
            key={`${index}:${step.text}`}
            className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-foreground/70"
          >
            <span className="min-w-0 truncate" title={step.text}>
              {step.text}
            </span>
          </div>
        ))
      )}
      {finalAnswer && !attentionLine ? (
        <CommentMarkdown
          content={finalAnswer}
          className={cn(
            'mt-0.5 min-w-0 break-words rounded-md border border-border/60 px-1.5 py-1 text-[13px] leading-5 text-foreground/85',
            compactMode ? 'line-clamp-2' : 'line-clamp-4',
            '[&_*]:!m-0 [&_*]:!p-0 [&_br]:hidden [&_ol]:list-none [&_ul]:list-none',
            '[&_pre]:!max-h-none [&_pre]:!overflow-visible [&_pre]:!whitespace-normal [&_pre]:!bg-transparent [&_pre]:![font:inherit] [&_pre_code]:![font:inherit]',
            '[&_div]:!overflow-visible [&_:is(table,thead,tbody,tr,th,td)]:!inline [&_:is(th,td)]:!border-0 [&_:is(th,td)]:!pr-2'
          )}
        />
      ) : null}
    </div>
  )
}

/** A prompt with a faint label column ("first", "latest") so the two never run together. */
function PromptRow({
  label,
  children
}: {
  label: string | null
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      {label ? (
        <span className="w-9 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1">{children}</div>
    </div>
  )
}
