import { useEffect, useMemo, useRef, type ComponentProps } from 'react'
import { CircleAlert, CircleHelp, Loader2, X } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import { useNow } from '@/lib/window-activity/use-now'
import { agentChildRowName } from '@/components/agent/status/agent-child-row-text'
import { formatNativeChatDuration } from '../../../../shared/native-chat/transcript/turns/native-chat-turn-status'
import { backgroundTaskRowStopId } from '../../../../shared/agent-status/presentation/background-tasks/background-task-roster'
import type { AgentChildRowModel } from '../../../../shared/agent-status/presentation/agent-child-row-model'
import type { NativeChatBackgroundTasksStatus } from './tools/tasks/NativeChatBackgroundTasksStatus'
import { structuredSessionBackgroundTaskGroups } from './tools/tasks/background-task-roster'
import { workerDockKindLabel, workerDockStateLabel } from './tools/tasks/dock/worker-dock-labels'
import type { WorkerDockRowView } from './tools/tasks/dock/WorkerDockRow'
import { NativeChatActivityLine, type NativeChatActivityCell } from './NativeChatActivityLine'
import { NativeChatWorkersStrip, type NativeChatDockWorkers } from './NativeChatWorkersStrip'
import {
  NativeChatActivityCellStop,
  nativeChatRunningWorkCell
} from './native-chat-running-work-cells'
import type { ReadShellCommands } from './native-chat-structured-shell-commands'
import { usePublishActivityLinesHeight } from './use-publish-activity-lines-height'

type Props = ComponentProps<typeof NativeChatBackgroundTasksStatus> & {
  paneKey: string
  /** The full commands of listed shells, by task id, for hover. */
  readCommands: ReadShellCommands
}

/** A subagent's own commands show in its view, as in a terminal chat; only agents it runs are listed. */
function withOwned(row: AgentChildRowModel): AgentChildRowModel[] {
  const owned =
    row.kind === 'agent'
      ? row.owned.filter(({ kind }) => kind === 'agent' || kind === 'workflow')
      : row.owned
  return [row, ...owned.flatMap(withOwned)]
}

/**
 * A structured chat's running work as Paweł's one-line strips (2026-11-24: "bring those things"
 * to every structured chat): the same lines as a terminal chat's, named items that need no click,
 * fed by the session's own roster instead of upstream's "4 total · 1 agent · 3 commands" list.
 * What only the host can do stays: stop one task, open a worker's result, clear a failed worker.
 */
export function NativeChatStructuredActivityLines(props: Props): React.JSX.Element {
  const t = useTranslate()
  const ref = useRef<HTMLDivElement>(null)
  usePublishActivityLinesHeight(ref)
  const { tasks, settledTasks, childViews, childRowContext, supportsTaskStop } = props
  const groups = useMemo(
    () => structuredSessionBackgroundTaskGroups(tasks, settledTasks, childViews, childRowContext),
    [tasks, settledTasks, childViews, childRowContext]
  )
  const rows = groups.flatMap((group) => group.tasks.flatMap(({ row }) => withOwned(row)))
  // The feed keeps rows it once read; only the host's own list says which workers there are now.
  const { workerIdentities, workerRows: readRows, loadWindow } = props
  const workerRows = (workerIdentities ?? []).flatMap(({ id }) => {
    const row = readRows?.get(id)
    return row?.kind === 'worker' ? [row] : []
  })
  const unread = workerIdentities?.find(({ id }) => readRows?.has(id) !== true)?.id
  useEffect(() => {
    if (unread !== undefined) {
      void loadWindow?.(unread)
    }
  }, [unread, loadWindow])
  const now = useNow(1_000, props.isVisible && rows.length + workerRows.length > 0)
  const { readCommands } = props
  // Read per slow tick, never per streamed frame; unchanged messages answer from its cache.
  const commands = readCommands()
  const agentCells: NativeChatActivityCell[] = []
  const shellCells: NativeChatActivityCell[] = []
  for (const row of rows) {
    if (row.settled) {
      continue
    }
    const label = agentChildRowName(row) || workerDockKindLabel(t, row.kind)
    const agent = row.kind === 'agent'
    const stopId = backgroundTaskRowStopId(row, supportsTaskStop)
    const command =
      row.kind !== 'agent' && row.providerId ? commands.get(row.providerId) : undefined
    const waiting = row.displayState === 'waiting' || row.displayState === 'blocked'
    const { providerId } = row
    const cell = nativeChatRunningWorkCell(
      {
        id: row.id,
        kind: row.kind,
        label,
        ...(command && command !== label ? { hover: `${label}\n${command}` } : {}),
        ...(row.firstObservedAt ? { startedAt: row.firstObservedAt } : {}),
        ...(waiting
          ? { attention: t('components.native-chat.runningWork.waiting', 'Waiting') }
          : {}),
        ...(agent && providerId
          ? {
              current: props.currentAgentId === providerId,
              onOpen: () => props.onShowAgent?.(providerId)
            }
          : {}),
        ...(row.kind === 'command' && providerId
          ? {
              onOpen: (opener: HTMLElement) =>
                props.onShowProviderDetails?.(commandDetailsRow(row, label, command), opener)
            }
          : {}),
        ...(stopId
          ? { onStop: () => props.onStop(stopId), stopping: props.stoppingTaskIds.has(stopId) }
          : {})
      },
      now
    )
    ;(agent || row.kind === 'workflow' ? agentCells : shellCells).push(cell)
  }
  if (props.offersStopAll) {
    const label = t('components.native-chat.runningWork.all', 'background work')
    shellCells.push({
      key: 'stop-all',
      node: (
        <span className="group/cell flex h-4 w-full min-w-0 items-center gap-1">
          <span className="min-w-0 flex-1 truncate">
            {props.incomplete
              ? t('components.native-chat.runningWork.unlisted', 'Other work is running')
              : t('components.native-chat.runningWork.allRunning', 'All background work')}
          </span>
          <NativeChatActivityCellStop
            label={label}
            pending={props.stoppingAll}
            onStop={() => props.onStop()}
          />
        </span>
      )
    })
  }
  const dockWorkers: NativeChatDockWorkers = new Map(
    workerRows.map((row) => [
      row.dispatchId,
      {
        settled: row.state === 'failed' || row.state === 'unexpected',
        cell: workerDockCell(row, now, props, t)
      }
    ])
  )
  const clearable = [...dockWorkers.values()].filter((worker) => worker.settled).length
  return (
    <div ref={ref} data-native-chat-activity-lines="" className="flex shrink-0 flex-col">
      <NativeChatWorkersStrip
        paneKey={props.paneKey}
        dockWorkers={dockWorkers}
        onClearAll={clearable > 1 ? () => props.onClearAll?.() : undefined}
      />
      <NativeChatActivityLine kind="subagents" cells={agentCells} />
      <NativeChatActivityLine kind="shells" cells={shellCells} />
    </div>
  )
}

/** What the details dialog needs to show one shell's command and output. */
function commandDetailsRow(
  row: AgentChildRowModel,
  label: string,
  command: string | undefined
): WorkerDockRowView {
  return {
    kind: 'command',
    id: row.id,
    dispatchId: row.id,
    source: '',
    name: label,
    // Under the name: what it runs, not the name again.
    title: command ?? label,
    model: null,
    state: 'running',
    changedAt: row.firstObservedAt || null,
    startedAt: row.firstObservedAt || null,
    reason: null,
    settlement: null,
    resultId: null,
    stoppable: false,
    ownerActionsAvailable: false,
    ...(row.providerId ? { providerId: row.providerId } : {})
  }
}

/** A worker only the host's dock lists, or a failed one: its name, state, age and own actions. */
function workerDockCell(
  row: WorkerDockRowView,
  now: number,
  props: Props,
  t: ReturnType<typeof useTranslate>
): NativeChatActivityCell {
  const failed = row.state === 'failed' || row.state === 'unexpected'
  const Icon = failed ? CircleAlert : row.state === 'needs-you' ? CircleHelp : Loader2
  const spins = row.state === 'running' || row.state === 'starting' || row.state === 'stopping'
  const pending = props.stoppingTaskIds.has(row.id)
  const state = workerDockStateLabel(t, row.state)
  const words = failed || row.state !== 'running' ? (row.reason ?? state) : row.title
  return {
    key: `worker:${row.id}`,
    node: (
      <span className="group/cell flex h-4 w-full min-w-0 items-center gap-1">
        <button
          type="button"
          title={`${row.name}: ${row.title}\n${state}${row.reason ? `\n${row.reason}` : ''}`}
          onClick={(event) => props.onOpenWorker?.(row, event.currentTarget)}
          className="flex h-4 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded px-0.5 text-left outline-none hover:bg-foreground/[0.06] focus-visible:ring-1 focus-visible:ring-ring"
        >
          <Icon
            aria-hidden="true"
            className={cn(
              'size-3 shrink-0',
              failed && 'text-destructive',
              row.state === 'needs-you' && 'text-chat-warning',
              spins && 'animate-spin motion-reduce:animate-none'
            )}
          />
          <span className="min-w-0 max-w-[60%] shrink-0 truncate font-medium text-chat-foreground">
            {row.name}
          </span>
          <span className={cn('min-w-0 flex-1 truncate', failed && 'text-destructive')}>
            {words}
          </span>
          {row.startedAt !== null && row.state === 'running' ? (
            <span className="shrink-0 font-mono tabular-nums">
              {formatNativeChatDuration(Math.max(0, (now - row.startedAt) / 1000))}
            </span>
          ) : null}
        </button>
        {failed && row.ownerActionsAvailable !== false && row.settlement ? (
          <button
            type="button"
            aria-label={t('components.native-chat.runningWork.clear', 'Clear {{name}}', {
              name: row.name
            })}
            disabled={pending}
            onClick={() => props.onWorkerAction?.(row, 'clear')}
            className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        ) : row.stoppable && row.ownerActionsAvailable !== false ? (
          <NativeChatActivityCellStop
            label={row.name}
            pending={pending}
            onStop={() => props.onWorkerAction?.(row, 'stop')}
          />
        ) : null}
      </span>
    )
  }
}
