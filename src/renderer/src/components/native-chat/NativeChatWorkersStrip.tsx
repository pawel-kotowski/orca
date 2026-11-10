import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Workflow } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { createActivityThreadActions } from '@/components/activity/activity-thread-actions'
import {
  ActivityWorkerRow,
  activityWorkersSummary
} from '@/components/activity/activity-thread-workers'
import { useCoordinatorWorkers } from '@/components/activity/activity-workers-feed'
import {
  activityThreadRowCopy,
  activityThreadStatusId
} from '@/components/activity/activity-thread-presentation'
import { NativeChatFooterChip } from './native-chat-footer-slot'

function isLive(state: ReturnType<typeof activityThreadStatusId>): boolean {
  return state === 'working' || state === 'monitoring'
}

/**
 * Orca workers in a chat (Paweł, 2026-11-10: "I need to see both native harness subagents and orca
 * subagents in given chat"), taking no space until asked ("they should take no space until i
 * click", "even if there are many running i dont need header row"). On the line under the message
 * box: a worker's chat gets a chip back to its coordinator ("i cant go back after click child in
 * parent chat"); a coordinator's chat gets a chip with its workers' count, which opens their rows
 * (the activity card's: state, name, latest line; a row opens the worker) above the box.
 */
export function NativeChatWorkersStrip({
  paneKey
}: {
  paneKey: string | null
}): React.JSX.Element | null {
  const { coordinator, workers, parent } = useCoordinatorWorkers(paneKey)
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const actions = useMemo(() => {
    const state = useAppStore.getState()
    return createActivityThreadActions({
      getMarkAllReadThreads: () => [],
      acknowledgeAgents: state.acknowledgeAgents,
      unacknowledgeAgents: state.unacknowledgeAgents,
      setSelectedPaneKey: () => {}
    })
  }, [])
  if (!paneKey || !coordinator || (workers.length === 0 && !parent)) {
    return null
  }
  const working = workers.filter((worker) => isLive(activityThreadStatusId(worker))).length
  const summary = activityWorkersSummary(workers)
  const parentName = parent ? activityThreadRowCopy(parent).workspaceLabel : ''
  return (
    <>
      {/* Why an anchor: it finds this chat's footer while the strip takes no space. */}
      <span ref={anchor} hidden />
      {parent ? (
        <NativeChatFooterChip
          anchor={anchor}
          pressed={null}
          title={translate('components.activity.workers.of', 'Worker of {{name}}', {
            name: parentName
          })}
          onClick={() => actions.selectThread(parent)}
        >
          <ArrowLeft aria-hidden="true" className="size-3 shrink-0" />
          <span className="min-w-0 truncate">{parentName}</span>
        </NativeChatFooterChip>
      ) : null}
      {workers.length > 0 ? (
        <NativeChatFooterChip
          anchor={anchor}
          pressed={open}
          title={summary}
          onClick={() => setOpen(!open)}
        >
          <Workflow
            aria-hidden="true"
            className="size-3 shrink-0"
            // Why inline: an arbitrary Tailwind colour class over a variable is not generated.
            style={working > 0 ? { color: 'var(--chat-hue-blue, currentColor)' } : undefined}
          />
          <span className="tabular-nums">
            {working > 0 ? `${working}/${workers.length}` : workers.length}
          </span>
        </NativeChatFooterChip>
      ) : null}
      {open && workers.length > 0 ? (
        <div data-native-chat-workers="" className="shrink-0 bg-chat-pane px-3 pt-2 sm:px-4">
          <div className="mx-auto w-full max-w-(--chat-content-max-width)">
            <div className="scrollbar-sleek flex max-h-40 flex-col overflow-y-auto rounded-lg border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground shadow-xs">
              {workers.map((worker) => (
                <ActivityWorkerRow
                  key={worker.paneKey}
                  worker={worker}
                  coordinator={coordinator}
                  onOpenWorker={(target) => actions.selectThread(target)}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
