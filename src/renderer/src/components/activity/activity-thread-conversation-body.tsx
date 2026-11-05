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
import { useAppStore } from '@/store'
import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { selectWorktreeHostDisplayLabel } from '@/lib/execution-host-display-label'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import { parseExecutionHostId } from '../../../../shared/execution-host'
import { activityProjectColor, activityRepoTagStyle } from './activity-project-color'
import { PanelsTopLeft } from 'lucide-react'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'

// Names compared loosely: "slack id-like-to-have-e557" repeats workspace "id-like-to-have-e557".
function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/^refs\/heads\//, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function repeats(text: string | null | undefined, of: string): boolean {
  if (!text) {
    return true
  }
  const own = comparable(text)
  const other = comparable(of)
  // Why: only a bare repeat, or one with a single leading word ("slack …", "owner/…"), says nothing
  // new; "Salus coaching reach plan" for workspace "salus-coaching-reach" is the agent row's name.
  const extraWords = own.split(' ').length - other.split(' ').length
  return own === other || (own.endsWith(` ${other}`) && extraWords <= 2)
}

/**
 * An activity card read from its conversation, built to scan: the workspace leads (repo and time
 * at its right), one quiet line names the agent's conversation, what the person asked sits in one
 * inset panel (first and latest), the agent's latest narration follows behind a thin rule, and the
 * answer closes it once the turn is done. Nothing repeats; controls appear on hover.
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
  /** What the agent waits on (a question, a permission); it replaces the narration. */
  attentionLine: string | null
  actions: ReactNode
  onActivate: (event: React.MouseEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const { firstPrompt, lastPrompt, steps, finalAnswer } = conversation.summary
  // Why: the same conversation name the workspace view's agent row shows, so the views match.
  const conversationName = useAgentRowConversationName({
    entry: thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry ?? {},
    rowSource: 'live',
    tab: thread.tab,
    paneKey: thread.paneKey,
    agentType: thread.agentType
  } as unknown as DashboardAgentRow)
  const repoName = thread.repo?.displayName ?? null
  // Why: the machine matters only when it is not this one (a devbox, a workstation).
  const machine = useAppStore((state) => {
    const hostId = getExecutionHostIdForWorktree(state, thread.worktree.id)
    return parseExecutionHostId(hostId)?.kind === 'local'
      ? null
      : selectWorktreeHostDisplayLabel(state, thread.worktree.id)
  })
  const branch = thread.worktree.branch?.replace(/^refs\/heads\//, '') ?? null
  const showsConversationName = !repeats(conversationName, workspaceLabel)
  const showsBranch = !repeats(branch, workspaceLabel)
  const showsBothPrompts = firstPrompt !== null && lastPrompt !== null && lastPrompt !== firstPrompt
  const narration = compactMode ? steps.slice(-1) : steps.slice(-2)
  const clamp = compactMode ? 'line-clamp-1' : 'line-clamp-2'
  const emphasis = thread.unread ? 'font-semibold' : 'font-medium'

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {/* Header: the repo's logo, then the workspace name; repo, machine and time at the right. */}
      <div className="flex min-w-0 items-center gap-2">
        {thread.worktree.id === FLOATING_TERMINAL_WORKTREE_ID ? (
          // Why: the floating workspace has no repo; its own icon (the floating panel button's)
          // stands where the repo logo would.
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.08]"
            title={translate('components.activity.floatingWorkspace', 'Floating workspace')}
          >
            <PanelsTopLeft className="size-4" />
          </span>
        ) : thread.repo ? (
          <RepoIconGlyph
            repoIcon={thread.repo.repoIcon}
            className="size-6 shrink-0 rounded-md"
            iconClassName="size-5"
          />
        ) : null}
        <button
          type="button"
          aria-keyshortcuts="Enter Space"
          onClick={onActivate}
          title={workspaceLabel}
          className={cn(
            'min-w-0 flex-1 cursor-pointer truncate text-left text-[14px] leading-5 text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring',
            thread.unread ? 'font-bold' : 'font-semibold'
          )}
        >
          {workspaceLabel}
        </button>
        {repoName ? (
          <span
            // Why: the tag reads at a glance: a clear fill (the project's colour when it has one)
            // and full-strength text.
            className="max-w-[40%] shrink-0 truncate rounded-full bg-foreground/[0.12] px-2 text-[10.5px] font-semibold leading-[18px] text-foreground"
            style={activityRepoTagStyle(activityProjectColor(thread.repo))}
            title={repoName}
          >
            {repoName}
          </span>
        ) : null}
        {machine ? (
          <span
            className="max-w-[30%] shrink-0 truncate rounded-full border border-border/70 px-1.5 text-[10.5px] font-medium leading-4 text-muted-foreground"
            title={machine}
          >
            {machine}
          </span>
        ) : null}
        <EventTime
          timestamp={thread.latestTimestamp}
          compact
          className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground hover:text-muted-foreground"
        />
      </div>

      {/* One quiet line: whose conversation this is, and its branch when that says something new. */}
      <div className="-mt-1 flex min-w-0 items-center gap-1.5 text-[11.5px] leading-4 text-muted-foreground">
        <span className="inline-flex shrink-0" title={agentLabel}>
          <AgentTypeIcon agentType={thread.agentType} size={12} />
        </span>
        <span className="min-w-0 truncate" title={conversationName ?? agentLabel}>
          {showsConversationName ? conversationName : agentLabel}
        </span>
        {showsBranch && branch ? (
          <span className="min-w-0 shrink truncate font-mono text-[10.5px] text-muted-foreground/80">
            {branch}
          </span>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 transition-opacity can-hover:opacity-0 can-hover:group-hover:opacity-100 group-focus-within:opacity-100">
          {actions}
        </span>
      </div>

      {/* What the person asked: first and latest, together and labeled. */}
      {firstPrompt !== null || lastPrompt !== null ? (
        <div className="flex min-w-0 flex-col gap-1 rounded-md bg-foreground/[0.04] px-2 py-1.5">
          <PromptRow
            label={showsBothPrompts ? translate('components.activity.prompt.first', 'First') : null}
            className={cn(clamp, emphasis)}
            text={firstPrompt ?? lastPrompt ?? ''}
          />
          {showsBothPrompts ? (
            <PromptRow
              label={translate('components.activity.prompt.latest', 'Latest')}
              className={cn(clamp, emphasis)}
              text={lastPrompt ?? ''}
            />
          ) : null}
        </div>
      ) : null}

      {/* What the agent is saying: its latest narration, newest brightest; or what it waits on. */}
      {attentionLine ? (
        <div
          className={cn(
            'min-w-0 break-words border-l-2 border-agent-question-text/60 pl-2 text-[12.5px] leading-5 text-agent-question-text',
            clamp
          )}
        >
          {attentionLine}
        </div>
      ) : narration.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-0.5 border-l border-border pl-2">
          {narration.map((step, index) => (
            <div
              key={`${index}:${step.text}`}
              className={cn(
                'min-w-0 truncate text-[12px] leading-[18px]',
                index === narration.length - 1 ? 'text-foreground/80' : 'text-foreground/50'
              )}
            >
              {step.text}
            </div>
          ))}
        </div>
      ) : null}

      {/* The answer, once the turn is done. */}
      {finalAnswer && !attentionLine ? (
        <CommentMarkdown
          content={finalAnswer}
          className={cn(
            'min-w-0 break-words border-l-2 border-emerald-500/60 pl-2 text-[12.5px] leading-5 text-foreground/85',
            compactMode ? 'line-clamp-2' : 'line-clamp-3',
            '[&_*]:!m-0 [&_*]:!p-0 [&_br]:hidden [&_ol]:list-none [&_ul]:list-none',
            '[&_pre]:!max-h-none [&_pre]:!overflow-visible [&_pre]:!whitespace-normal [&_pre]:!bg-transparent [&_pre]:![font:inherit] [&_pre_code]:![font:inherit]',
            '[&_div]:!overflow-visible [&_:is(table,thead,tbody,tr,th,td)]:!inline [&_:is(th,td)]:!border-0 [&_:is(th,td)]:!pr-2'
          )}
        />
      ) : null}
    </div>
  )
}

/** A prompt with a small label column ("First", "Latest") so the two never run together. */
function PromptRow({
  label,
  text,
  className
}: {
  label: string | null
  text: string
  className: string
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      {label ? (
        <span className="w-9 shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
          {label}
        </span>
      ) : null}
      <span
        className={cn(
          'min-w-0 flex-1 break-words text-[12.5px] leading-[18px] text-foreground/90',
          className
        )}
      >
        {text}
      </span>
    </div>
  )
}
