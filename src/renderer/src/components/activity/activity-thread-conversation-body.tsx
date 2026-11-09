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
import { activityRepoTagStyle, useActivityProjectColor } from './activity-project-color'
import { CornerDownRight, PanelsTopLeft } from 'lucide-react'
import { ActivityMachineMark } from './activity-machine-mark'
import { ActivityWorkerOfTag } from './activity-thread-workers'
import { useActivityCardHiddenParts, type ActivityCardPart } from './activity-card-parts'
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
 * An activity card read from its conversation, built to scan: a top line carries the agent's
 * state, the repo and machine tags and the time; the workspace name follows on a row of its own,
 * never cut, then one quiet line naming the agent's conversation. The agent's latest output is the
 * card's body text, the most visible thing on it; the person's prompts close it as quiet lines.
 * Every piece can be hidden from the strip above the list (activity-card-parts).
 */
export function ActivityThreadConversationBody({
  thread,
  conversation,
  workspaceLabel,
  agentLabel,
  compactMode,
  attentionLine,
  corner,
  actions,
  onActivate
}: {
  thread: AgentPaneThread
  conversation: ActivityThreadConversation
  workspaceLabel: string
  agentLabel: string
  compactMode: boolean
  /** What the agent waits on (a question, a permission); it replaces the output. */
  attentionLine: string | null
  /** The top-right slot: the state, the unseen bell or the clear X (activity-thread-row-actions). */
  corner: ReactNode
  actions: ReactNode
  onActivate: (event: React.MouseEvent<HTMLButtonElement>) => void
}): React.JSX.Element {
  const { firstPrompt, lastPrompt, steps, finalAnswer } = conversation.summary
  const hidden = useActivityCardHiddenParts()
  const shows = (part: ActivityCardPart): boolean => !hidden.includes(part)
  // Why: the same conversation name the workspace view's agent row shows, so the views match.
  const conversationName = useAgentRowConversationName({
    entry: thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry ?? {},
    rowSource: 'live',
    tab: thread.tab,
    paneKey: thread.paneKey,
    agentType: thread.agentType
  } as unknown as DashboardAgentRow)
  const repoName = shows('repo') ? (thread.repo?.displayName ?? null) : null
  const projectColor = useActivityProjectColor(thread.repo)
  // Why: null for this computer, which draws as its own mark; another machine by its name.
  const remoteMachine = useAppStore((state) => {
    const hostId = getExecutionHostIdForWorktree(state, thread.worktree.id)
    return parseExecutionHostId(hostId)?.kind === 'local'
      ? null
      : selectWorktreeHostDisplayLabel(state, thread.worktree.id)
  })
  const branch = thread.worktree.branch?.replace(/^refs\/heads\//, '') ?? null
  const showsConversationName = !repeats(conversationName, workspaceLabel)
  const showsBranch = !repeats(branch, workspaceLabel)
  // Why: the latest prompt is the one that matters now; the first only adds when it differs.
  const latestPrompt = shows('latestPrompt') ? (lastPrompt ?? firstPrompt) : null
  const earlierPrompt =
    shows('firstPrompt') && firstPrompt !== null && firstPrompt !== (lastPrompt ?? firstPrompt)
      ? firstPrompt
      : null
  const latestStep = steps.at(-1) ?? null
  const showsOutput = shows('output')
  const outputClamp = compactMode ? 'line-clamp-2' : 'line-clamp-4'

  const showsConversation = shows('conversation')
  const topLineEmpty =
    !repoName && !shows('machine') && !showsConversation && !shows('time') && !shows('status')
  // Why: the corner rides on the top line; with that line hidden it moves to the workspace row.
  const actionsSlot = (
    <span className="flex shrink-0 items-center gap-0.5">
      {actions}
      {corner}
    </span>
  )

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      {/* Top line: tags and whose conversation this is at the left; time and state at the right. */}
      {/* Why only with something to show: with every top-line piece hidden the row goes and its
          buttons move to the workspace row (or float at the corner), so the card shrinks (Paweł,
          2026-11-08: "card height should decrease to not waste space"). */}
      {topLineEmpty ? (
        shows('workspace') ? null : (
          <span className="absolute right-2 top-1.5 z-10">{actionsSlot}</span>
        )
      ) : (
        <div className="flex min-h-5 min-w-0 items-center gap-1.5">
          {repoName ? (
            <span
              // Why: the tag reads at a glance: a clear fill (the project's colour when it has one)
              // and full-strength text.
              className="min-w-0 max-w-[45%] shrink-0 truncate rounded-full bg-foreground/[0.12] px-2 text-[10.5px] font-semibold leading-[18px] text-foreground"
              style={activityRepoTagStyle(projectColor)}
              title={repoName}
            >
              {repoName}
            </span>
          ) : null}
          {shows('machine') ? <ActivityMachineMark remoteName={remoteMachine} /> : null}
          <ActivityWorkerOfTag thread={thread} />
          {showsConversation ? (
            <span className="flex min-w-0 flex-1 items-center gap-1 text-[11.5px] leading-4 text-muted-foreground">
              <span className="inline-flex shrink-0" title={agentLabel}>
                <AgentTypeIcon agentType={thread.agentType} size={12} />
              </span>
              <span className="min-w-0 truncate" title={conversationName ?? agentLabel}>
                {showsConversationName ? conversationName : agentLabel}
              </span>
              {showsBranch && branch ? (
                <span
                  className="min-w-0 shrink-[2] truncate font-mono text-[10.5px] text-muted-foreground/80"
                  title={branch}
                >
                  {branch}
                </span>
              ) : null}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {actions}
          {shows('time') ? (
            <EventTime
              timestamp={thread.latestTimestamp}
              compact
              className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground hover:text-muted-foreground"
            />
          ) : null}
          {corner}
        </div>
      )}

      {/* The workspace: the repo's logo, then its whole name, wrapping rather than cut. */}
      {shows('workspace') ? (
        <div className="flex min-w-0 items-start gap-2">
          {thread.worktree.id === FLOATING_TERMINAL_WORKTREE_ID ? (
            // Why: the floating workspace has no repo; its own icon (the floating panel button's)
            // stands where the repo logo would.
            <span
              className="mt-px flex size-[18px] shrink-0 items-center justify-center rounded bg-foreground/[0.08]"
              title={translate('components.activity.floatingWorkspace', 'Floating workspace')}
            >
              <PanelsTopLeft className="size-3" />
            </span>
          ) : thread.repo ? (
            <RepoIconGlyph
              repoIcon={thread.repo.repoIcon}
              className="mt-px size-[18px] shrink-0 rounded"
              iconClassName="size-3.5"
            />
          ) : null}
          <button
            type="button"
            aria-keyshortcuts="Enter Space"
            onClick={onActivate}
            title={workspaceLabel}
            className={cn(
              'min-w-0 flex-1 cursor-pointer break-words text-left text-[13.5px] leading-5 text-foreground outline-none [overflow-wrap:anywhere] focus-visible:ring-1 focus-visible:ring-ring',
              thread.unread ? 'font-bold' : 'font-semibold'
            )}
          >
            {workspaceLabel}
          </button>
          {topLineEmpty ? actionsSlot : null}
        </div>
      ) : null}

      {/* The agent's latest output, the card's body: what it waits on, its answer, or where it is. */}
      {showsOutput && attentionLine ? (
        <div
          className={cn(
            'mt-0.5 min-w-0 break-words text-[13px] font-medium leading-5 text-agent-question-text',
            outputClamp
          )}
        >
          {attentionLine}
        </div>
      ) : showsOutput && finalAnswer ? (
        <CommentMarkdown
          content={finalAnswer}
          className={cn(
            'mt-0.5 min-w-0 break-words text-[13px] leading-5 text-foreground',
            outputClamp,
            '[&_*]:!m-0 [&_*]:!p-0 [&_br]:hidden [&_ol]:list-none [&_ul]:list-none',
            '[&_pre]:!max-h-none [&_pre]:!overflow-visible [&_pre]:!whitespace-normal [&_pre]:!bg-transparent [&_pre]:![font:inherit] [&_pre_code]:![font:inherit]',
            '[&_div]:!overflow-visible [&_:is(table,thead,tbody,tr,th,td)]:!inline [&_:is(th,td)]:!border-0 [&_:is(th,td)]:!pr-2'
          )}
        />
      ) : showsOutput && latestStep ? (
        // Why: mid-turn narration is where the agent is, not what it concluded: same place, softer.
        <div
          className={cn(
            'mt-0.5 min-w-0 break-words text-[13px] leading-5 text-foreground/70',
            outputClamp
          )}
        >
          {latestStep.text}
        </div>
      ) : null}

      {/* What the person asked, as quiet closing lines: the first (when it differs), then the latest. */}
      {earlierPrompt !== null || latestPrompt !== null ? (
        <div className="mt-0.5 flex min-w-0 flex-col gap-0.5 border-t border-border/50 pt-1.5">
          {earlierPrompt !== null ? (
            <PromptLine text={earlierPrompt} className="text-muted-foreground/70" />
          ) : null}
          {latestPrompt !== null ? (
            <PromptLine text={latestPrompt} className="text-muted-foreground" />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** One prompt the person sent, after a small "you" mark, on one line. */
function PromptLine({ text, className }: { text: string; className: string }): React.JSX.Element {
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5 text-[12px] leading-[18px]', className)}>
      <CornerDownRight aria-hidden className="size-3 shrink-0 opacity-70" />
      <span className="min-w-0 truncate" title={text}>
        {text}
      </span>
    </div>
  )
}
