import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { createActivityThreadActions } from '@/components/activity/thread-list/activity-thread-actions'
import { ActivityWorkerRow } from '@/components/activity/activity-thread-workers'
import { useCoordinatorWorkers } from '@/components/activity/activity-workers-feed'
import { activityThreadRowCopy } from '@/components/activity/threads/activity-thread-presentation'
import { NativeChatActivityLine, type NativeChatActivityCell } from './NativeChatActivityLine'
import type { AgentPaneThread } from '@/components/activity/threads/activity-thread-types'

/** A worker the chat's host reports, drawn as one cell; `settled` ones failed and await a Clear. */
export type NativeChatDockWorkers = ReadonlyMap<
  string,
  { cell: NativeChatActivityCell; settled: boolean }
>

const NO_DOCK_WORKERS: NativeChatDockWorkers = new Map()

function workerDispatchId(worker: AgentPaneThread): string {
  const entry = worker.currentAgentEntry ?? worker.latestEvent?.entry
  return entry?.orchestration?.dispatchId ?? worker.paneKey
}

/**
 * Orca workers in a chat (Paweł, 2026-11-10: "I need to see both native harness subagents and orca
 * subagents in given chat"), always shown above the message box, one thin line each: a worker's
 * chat names its coordinator, one click back to it ("for child parent always visible over input
 * box"); a coordinator's chat lists its workers side by side (the activity card's state, name and
 * latest line; a click opens the worker), wrapping onto more rows only when asked.
 */
export function NativeChatWorkersStrip({
  paneKey,
  dockWorkers = NO_DOCK_WORKERS,
  onClearAll
}: {
  paneKey: string | null
  /** A structured chat's workers as its host reports them, by dispatch; a terminal chat has none. */
  dockWorkers?: NativeChatDockWorkers
  /** Clears every failed worker at once, where more than one waits for it. */
  onClearAll?: () => void
}): React.JSX.Element | null {
  const { coordinator, workers, parent } = useCoordinatorWorkers(paneKey)
  const actions = useMemo(() => {
    const state = useAppStore.getState()
    return createActivityThreadActions({
      getMarkAllReadThreads: () => [],
      acknowledgeAgents: state.acknowledgeAgents,
      unacknowledgeAgents: state.unacknowledgeAgents,
      setSelectedPaneKey: () => {}
    })
  }, [])
  if (!paneKey || (!coordinator && dockWorkers.size === 0)) {
    return null
  }
  const listed = new Set(workers.map(workerDispatchId))
  // The host's own row speaks for a worker with no agent here, and for one that failed.
  const dockCells = [...dockWorkers].flatMap(([dispatchId, worker]) =>
    worker.settled || !listed.has(dispatchId) ? [worker.cell] : []
  )
  // The coordinator's agent name (its conversation), as its own card titles it; not its workspace.
  const parentName = parent ? activityThreadRowCopy(parent).taskTitle : ''
  return (
    <>
      {parent ? (
        <NativeChatActivityLine
          kind="coordinator"
          cells={[
            {
              key: parent.paneKey,
              node: (
                <button
                  type="button"
                  title={translate('components.activity.workers.of', 'Worker of {{name}}', {
                    name: parentName
                  })}
                  onClick={() => actions.selectThread(parent)}
                  className="flex h-4 w-full min-w-0 cursor-pointer items-center gap-1 rounded px-0.5 outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <ArrowLeft aria-hidden="true" className="size-3 shrink-0" />
                  <span className="shrink-0">
                    {translate('components.activity.workers.workerOf', 'Worker of')}
                  </span>
                  <span className="min-w-0 truncate font-medium text-chat-foreground">
                    {parentName}
                  </span>
                </button>
              )
            }
          ]}
        />
      ) : null}
      <NativeChatActivityLine
        kind="workers"
        cells={[
          ...dockCells,
          ...(coordinator
            ? workers
                .filter((worker) => !dockWorkers.get(workerDispatchId(worker))?.settled)
                .map((worker) => ({
                  key: worker.paneKey,
                  node: (
                    <ActivityWorkerRow
                      compact
                      worker={worker}
                      coordinator={coordinator}
                      onOpenWorker={(target) => actions.selectThread(target)}
                    />
                  )
                }))
            : []),
          ...(onClearAll
            ? [
                {
                  key: 'clear-all',
                  node: (
                    <button
                      type="button"
                      onClick={onClearAll}
                      className="h-4 cursor-pointer rounded px-1 outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {translate('components.native-chat.workerDock.clearAll', 'Clear all')}
                    </button>
                  )
                }
              ]
            : [])
        ]}
      />
    </>
  )
}
