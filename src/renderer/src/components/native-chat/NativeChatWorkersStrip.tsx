import { useMemo } from 'react'
import { ArrowLeft } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { createActivityThreadActions } from '@/components/activity/activity-thread-actions'
import { ActivityWorkerRow } from '@/components/activity/activity-thread-workers'
import { useCoordinatorWorkers } from '@/components/activity/activity-workers-feed'
import { activityThreadRowCopy } from '@/components/activity/activity-thread-presentation'
import { NativeChatActivityLine } from './NativeChatActivityLine'

/**
 * Orca workers in a chat (Paweł, 2026-11-10: "I need to see both native harness subagents and orca
 * subagents in given chat"), always shown above the message box, one thin line each: a worker's
 * chat names its coordinator, one click back to it ("for child parent always visible over input
 * box"); a coordinator's chat lists its workers side by side (the activity card's state, name and
 * latest line; a click opens the worker), wrapping onto more rows only when asked.
 */
export function NativeChatWorkersStrip({
  paneKey
}: {
  paneKey: string | null
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
  if (!paneKey || !coordinator) {
    return null
  }
  const parentName = parent ? activityThreadRowCopy(parent).workspaceLabel : ''
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
        cells={workers.map((worker) => ({
          key: worker.paneKey,
          node: (
            <ActivityWorkerRow
              compact
              worker={worker}
              coordinator={coordinator}
              onOpenWorker={(target) => actions.selectThread(target)}
            />
          )
        }))}
      />
    </>
  )
}
