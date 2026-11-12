import { useSyncExternalStore } from 'react'
import { ChevronRight } from 'lucide-react'
import { AgentStateDot } from '@/components/AgentStateDot'
import { cn } from '@/lib/class-names'
import { translate } from '@/i18n/i18n'
import { activityThreadRowCopy, activityThreadStatusId } from './activity-thread-presentation'
import type { AgentPaneThread } from './activity-thread-types'
import { useActivityWorkersContext } from './activity-workers'
import { useActivityThreadConversation } from './use-activity-thread-conversation'

const OPEN_KEY = 'orca.activityWorkersOpen'
const listeners = new Set<() => void>()
let openParents: ReadonlySet<string> = readOpenParents()

function readOpenParents(): ReadonlySet<string> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? '[]')
    return new Set(Array.isArray(stored) ? stored.filter((key) => typeof key === 'string') : [])
  } catch {
    return new Set()
  }
}

// Why a module store: the list virtualizes, so a card's own state would forget on scroll.
function toggleOpen(parentKey: string): void {
  const next = new Set(openParents)
  if (!next.delete(parentKey)) {
    next.add(parentKey)
  }
  openParents = next
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify([...next]))
  } catch {
    // Why: without storage the fold still works; it just forgets on reload.
  }
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function workerName(worker: AgentPaneThread, coordinator: AgentPaneThread): string {
  const orchestration =
    worker.currentAgentEntry?.orchestration ?? worker.latestEvent?.entry.orchestration
  const copy = activityThreadRowCopy(worker)
  // Why the workspace before the prompt: a worker in a workspace of its own is known by that
  // name in Projects; its first prompt is the brief's boilerplate ("You are working inside Orca…").
  return (
    orchestration?.displayName?.trim() ||
    orchestration?.taskTitle?.trim() ||
    (worker.worktree.id !== coordinator.worktree.id ? copy.workspaceLabel : '') ||
    copy.taskTitle
  )
}

/** Markdown to one plain line, for a row that shows the start of an answer. */
function plainLine(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]+/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * One worker: its state, name and the line an activity card would show (Paweł, 2026-11-09: "it
 * shows bash command instead step / output as activity cards do"): its answer once done, its
 * latest narration while it works, else the status line.
 */
export function ActivityWorkerRow({
  worker,
  coordinator,
  onOpenWorker,
  compact = false
}: {
  worker: AgentPaneThread
  coordinator: AgentPaneThread
  onOpenWorker: (worker: AgentPaneThread, event: React.MouseEvent) => void
  /** The chat's one-line cell: the footer's small type, the name not capped to a share. */
  compact?: boolean
}): React.JSX.Element {
  const conversation = useActivityThreadConversation(worker, true)
  const name = workerName(worker, coordinator)
  const summary = conversation?.summary
  const line =
    (summary?.finalAnswer ? plainLine(summary.finalAnswer) : '') ||
    summary?.steps.at(-1)?.text ||
    activityThreadRowCopy(worker).statusLine
  return (
    <button
      type="button"
      title={line ? `${name}: ${line}` : name}
      onClick={(event) => {
        event.stopPropagation()
        onOpenWorker(worker, event)
      }}
      className={`flex min-w-0 cursor-pointer items-center gap-1.5 rounded text-left outline-none hover:bg-foreground/[0.06] focus-visible:ring-1 focus-visible:ring-ring ${
        compact ? 'h-4 w-full px-0.5 text-2xs leading-4' : 'px-1 py-0.5 text-[12px] leading-[18px]'
      }`}
    >
      <span className="inline-flex size-3.5 shrink-0 items-center justify-center">
        <AgentStateDot state={activityThreadStatusId(worker)} size="sm" />
      </span>
      <span
        className={`min-w-0 shrink-0 truncate font-medium text-foreground/90 ${compact ? 'max-w-[60%]' : 'max-w-[45%]'}`}
      >
        {name}
      </span>
      {line ? <span className="min-w-0 flex-1 truncate text-muted-foreground">{line}</span> : null}
    </button>
  )
}

export function activityWorkersSummary(workers: readonly AgentPaneThread[]): string {
  let working = 0
  let needsYou = 0
  let failed = 0
  let finished = 0
  for (const worker of workers) {
    const state = activityThreadStatusId(worker)
    if (state === 'working' || state === 'monitoring' || state === 'unverifiable') {
      working += 1
    } else if (state === 'waiting' || state === 'permission' || state === 'blocked') {
      needsYou += 1
    } else if (state === 'failed') {
      failed += 1
    } else {
      finished += 1
    }
  }
  const parts = [
    translate('components.activity.workers.count', '{{count}} workers', {
      count: workers.length,
      defaultValue_one: '{{count}} worker'
    })
  ]
  if (working > 0) {
    parts.push(translate('components.activity.workers.working', '{{n}} working', { n: working }))
  }
  if (needsYou > 0) {
    parts.push(translate('components.activity.workers.needsYou', '{{n}} need you', { n: needsYou }))
  }
  if (failed > 0) {
    parts.push(translate('components.activity.workers.failed', '{{n}} failed', { n: failed }))
  }
  if (finished > 0) {
    parts.push(translate('components.activity.workers.done', '{{n}} done', { n: finished }))
  }
  return parts.join(' · ')
}

/**
 * A coordinator's workers, folded into its card (activity-workers): one summary line that opens
 * into a row per worker (state, name, latest line). A row opens that worker's terminal, in
 * whichever workspace it runs.
 */
export function ActivityThreadWorkers({
  thread,
  onOpenWorker
}: {
  thread: AgentPaneThread
  onOpenWorker: (worker: AgentPaneThread, event: React.MouseEvent) => void
}): React.JSX.Element | null {
  const workers = useActivityWorkersContext().workersByParent.get(thread.paneKey)
  const open = useSyncExternalStore(
    subscribe,
    () => openParents.has(thread.paneKey),
    () => false
  )
  if (!workers || workers.length === 0) {
    return null
  }
  return (
    <div
      data-activity-thread-control=""
      className="mt-0.5 flex min-w-0 flex-col border-t border-border/50 pt-1"
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          toggleOpen(thread.paneKey)
        }}
        className="flex min-w-0 cursor-pointer items-center gap-1 rounded text-left text-[11.5px] leading-[18px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
      >
        <ChevronRight className={cn('size-3 shrink-0 transition-transform', open && 'rotate-90')} />
        <span className="min-w-0 truncate">{activityWorkersSummary(workers)}</span>
      </button>
      {open ? (
        <div className="mt-0.5 flex min-w-0 flex-col">
          {workers.map((worker) => (
            <ActivityWorkerRow
              key={worker.paneKey}
              worker={worker}
              coordinator={thread}
              onOpenWorker={onOpenWorker}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** A worker listed as its own card (it waits on you) names the coordinator it works for. */
export function ActivityWorkerOfTag({
  thread
}: {
  thread: AgentPaneThread
}): React.JSX.Element | null {
  const parent = useActivityWorkersContext().parentByWorker.get(thread.paneKey)
  if (!parent) {
    return null
  }
  // Why the agent's name: a coordinator is known by its conversation, not its workspace
  // (Paweł, 2026-11-10: "worker of shows workspace name instead of agent name").
  const parentName = activityThreadRowCopy(parent).taskTitle
  return (
    <span
      className="min-w-0 max-w-[40%] shrink truncate rounded-full border border-border/70 px-1.5 text-[10.5px] leading-4 text-muted-foreground"
      title={translate('components.activity.workers.of', 'Worker of {{name}}', {
        name: parentName
      })}
    >
      {translate('components.activity.workers.of', 'Worker of {{name}}', { name: parentName })}
    </span>
  )
}
