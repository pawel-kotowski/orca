import { useMemo, useState } from 'react'
import { ChevronDown, Workflow } from 'lucide-react'
import { useAppStore } from '@/store'
import { createActivityThreadActions } from '@/components/activity/activity-thread-actions'
import {
  ActivityWorkerRow,
  activityWorkersSummary
} from '@/components/activity/activity-thread-workers'
import { useCoordinatorWorkers } from '@/components/activity/activity-workers-feed'
import { activityThreadStatusId } from '@/components/activity/activity-thread-presentation'

const OPEN_KEY = 'orca.chatWorkersClosed'

function readClosed(paneKey: string): boolean {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? '[]')
    return Array.isArray(stored) && stored.includes(paneKey)
  } catch {
    return false
  }
}

function writeClosed(paneKey: string, closed: boolean): void {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? '[]')
    const keys = new Set(
      Array.isArray(stored) ? stored.filter((key) => typeof key === 'string') : []
    )
    if (closed) {
      keys.add(paneKey)
    } else {
      keys.delete(paneKey)
    }
    window.localStorage.setItem(OPEN_KEY, JSON.stringify([...keys].slice(-200)))
  } catch {
    // Why: without storage the strip still folds; it just forgets on reload.
  }
}

/**
 * The Orca workers this chat's agent dispatched (`orca orchestration worker-start`), above the
 * message box (Paweł, 2026-11-10: "I need to see both native harness subagents and orca
 * subagents in given chat"). The same rows as the activity card's worker fold: state, name and
 * the worker's latest line; a row opens that worker. Open by default; the fold is remembered.
 */
export function NativeChatWorkersStrip({
  paneKey
}: {
  paneKey: string | null
}): React.JSX.Element | null {
  const { coordinator, workers } = useCoordinatorWorkers(paneKey)
  const [closed, setClosed] = useState(() => (paneKey ? readClosed(paneKey) : false))
  const actions = useMemo(() => {
    const state = useAppStore.getState()
    return createActivityThreadActions({
      getMarkAllReadThreads: () => [],
      acknowledgeAgents: state.acknowledgeAgents,
      unacknowledgeAgents: state.unacknowledgeAgents,
      setSelectedPaneKey: () => {}
    })
  }, [])
  if (!paneKey || !coordinator || workers.length === 0) {
    return null
  }
  const live = workers.some((worker) => {
    const state = activityThreadStatusId(worker)
    return state === 'working' || state === 'monitoring'
  })
  return (
    <div data-native-chat-workers="" className="shrink-0 bg-chat-pane px-3 pt-2 sm:px-4">
      <div className="mx-auto w-full max-w-(--chat-content-max-width)">
        <div className="overflow-hidden rounded-lg border border-border bg-muted/50 text-xs text-muted-foreground shadow-xs">
          <button
            type="button"
            aria-expanded={!closed}
            onClick={() => {
              setClosed(!closed)
              writeClosed(paneKey, !closed)
            }}
            className="flex h-8 w-full cursor-pointer items-center gap-2 px-3 text-left outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Workflow
              aria-hidden="true"
              className="size-3.5 shrink-0"
              // Why inline: an arbitrary Tailwind colour class over a variable is not generated.
              style={live ? { color: 'var(--chat-hue-blue, currentColor)' } : undefined}
            />
            <span className="min-w-0 flex-1 truncate">{activityWorkersSummary(workers)}</span>
            <ChevronDown
              aria-hidden="true"
              className={`size-3 shrink-0 transition-transform motion-reduce:transition-none ${closed ? '' : 'rotate-180'}`}
            />
          </button>
          {closed ? null : (
            <div className="scrollbar-sleek flex max-h-40 flex-col overflow-y-auto border-t border-border px-2 py-1.5">
              {workers.map((worker) => (
                <ActivityWorkerRow
                  key={worker.paneKey}
                  worker={worker}
                  coordinator={coordinator}
                  onOpenWorker={(target) => actions.selectThread(target)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
