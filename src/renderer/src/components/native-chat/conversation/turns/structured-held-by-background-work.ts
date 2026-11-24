import { agentChildWorkLiveness } from '../../../../../../shared/agent-status/child-work/agent-status-child-work-liveness'
import type { StructuredSessionBackgroundTasksView } from '../../../../../../shared/agent-session/view/structured-session-background-tasks-view'

/** The turn ended while only shells or Monitors run, as the terminal chat's `monitoring` status says. */
export function structuredHeldByBackgroundWork(
  background: Pick<StructuredSessionBackgroundTasksView, 'isMonitoring' | 'children' | 'tasks'>,
  isWorking: boolean
): boolean {
  return (
    !isWorking &&
    background.isMonitoring &&
    // `tasks` drops a child without a provider id; only an older host sends no `children`.
    agentChildWorkLiveness(background.children ?? background.tasks) === 'monitoring'
  )
}
