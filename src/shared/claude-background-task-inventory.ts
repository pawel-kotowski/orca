import { classifyClaudeBackgroundTaskKind } from './claude-background-task-kind'
import { isAgentChildWorkKind } from './agent-status-child-work-liveness'

const CLAUDE_TERMINAL_BACKGROUND_TASK_STATUSES = new Set([
  'idle',
  'done',
  'success',
  'succeeded',
  'complete',
  'completed',
  'finished',
  'failed',
  'error',
  'terminated',
  'exited',
  'aborted',
  'expired',
  'skipped',
  'crashed',
  'killed',
  'cancelled',
  'canceled',
  'timed_out'
])

// Why: publishing or watching a claude.ai artifact arms a live-updates watch that Claude lists as a running
// monitor until the session exits; it never wakes the session, and Claude's own task footer hides it (#26192).
const CLAUDE_ARTIFACT_WATCH_DESCRIPTION = 'live updates for artifact '

function isClaudeArtifactWatch(taskType: string, description: unknown): boolean {
  return (
    taskType === 'monitor' &&
    typeof description === 'string' &&
    description.startsWith(CLAUDE_ARTIFACT_WATCH_DESCRIPTION)
  )
}

/** Agent entries from Stop/SubagentStop background_tasks; non-agent tasks do not become rows. */
export type ClaudeBackgroundAgentTask = {
  id: string
  agentType?: string
  description?: string
  running: boolean
  /** Teammate IDs never match lifecycle agent_ids and stay running even after completion, so they prove no per-agent state. */
  teammate: boolean
}

/** Absent/malformed inventory on older Claude builds means retain the tracked roster; never clear it. */
export function readClaudeBackgroundAgentTasks(hookPayload: Record<string, unknown>): {
  present: boolean
  tasks: ClaudeBackgroundAgentTask[]
  truncated: boolean
  hasRunningNonAgentTask: boolean
  /** Ids of the running shell-like entries; one without an id is counted but not listed. */
  runningNonAgentTaskIds: string[]
} {
  const raw = hookPayload['background_tasks']
  if (!Array.isArray(raw)) {
    return {
      present: false,
      tasks: [],
      truncated: false,
      hasRunningNonAgentTask: false,
      runningNonAgentTaskIds: []
    }
  }
  const tasks: ClaudeBackgroundAgentTask[] = []
  let truncated = false
  let hasRunningNonAgentTask = false
  const runningNonAgentTaskIds: string[] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) {
      truncated = true
      hasRunningNonAgentTask = true
      continue
    }
    const obj = item as Record<string, unknown>
    const taskType = typeof obj.type === 'string' ? obj.type.trim().toLowerCase() : ''
    const taskStatus = typeof obj.status === 'string' ? obj.status.trim().toLowerCase() : ''
    const isTerminal =
      taskStatus.length > 0 && CLAUDE_TERMINAL_BACKGROUND_TASK_STATUSES.has(taskStatus)
    if (isClaudeArtifactWatch(taskType, obj.description)) {
      continue
    }
    if (taskType.length === 0) {
      truncated = true
      hasRunningNonAgentTask ||= !isTerminal
      continue
    }
    const isAgentTask = isAgentChildWorkKind(classifyClaudeBackgroundTaskKind(taskType))
    // Why: future non-agent types and nonterminal labels must fail active; only typed agent rows or explicit terminal states can safely retire work.
    if (!isAgentTask && !isTerminal) {
      hasRunningNonAgentTask = true
      const id = typeof obj.id === 'string' ? obj.id.trim() : ''
      if (id.length > 0) {
        runningNonAgentTaskIds.push(id)
      }
    }
    if (!isAgentTask) {
      continue
    }
    if (typeof obj.id !== 'string' || obj.id.trim().length === 0) {
      truncated = true
      continue
    }
    tasks.push({
      id: obj.id.trim(),
      agentType: typeof obj.agent_type === 'string' ? obj.agent_type : undefined,
      description: typeof obj.description === 'string' ? obj.description : undefined,
      running: !isTerminal,
      teammate: taskType === 'teammate'
    })
  }
  return { present: true, tasks, truncated, hasRunningNonAgentTask, runningNonAgentTaskIds }
}

/** Ids of every running entry in one inventory; session crons are prefixed so they cannot collide with task ids. */
export function claudeRunningBackgroundTaskIds(
  inventory: Pick<
    ReturnType<typeof readClaudeBackgroundAgentTasks>,
    'tasks' | 'runningNonAgentTaskIds'
  >,
  sessionCrons: unknown
): Set<string> {
  const ids = new Set(inventory.runningNonAgentTaskIds)
  for (const task of inventory.tasks) {
    if (task.running) {
      ids.add(task.id)
    }
  }
  if (Array.isArray(sessionCrons)) {
    for (const cron of sessionCrons) {
      const id =
        typeof cron === 'object' && cron !== null ? (cron as { id?: unknown }).id : undefined
      if (typeof id === 'string' && id.length > 0) {
        ids.add(`cron:${id}`)
      }
    }
  }
  return ids
}
