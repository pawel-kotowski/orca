import type { AgentSessionBackgroundTask } from '../../agent-session/agent-session-background-task-wire'
import { readClaudeTaskNotification } from '../../claude-task-notification-text'
import {
  isTextBlock,
  isToolCallBlock,
  isToolResultBlock,
  type NativeChatMessage
} from '../native-chat-types'

type StartedShell = {
  callId: string
  taskId: string | null
  kind: 'command' | 'monitor'
  label: string
  startedAt?: number
  /** A Monitor stops at its timeout unless it is persistent. */
  expiresAt?: number
}

const BACKGROUND_ID = /with ID: ([A-Za-z0-9_-]+)/
const MONITOR_ID = /\(task ([A-Za-z0-9_-]+)/
const NOTIFIED_CALL_ID = /<tool-use-id>([^<]+)<\/tool-use-id>/
const MONITOR_DEFAULT_TIMEOUT_MS = 300_000

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function firstLine(command: string | null): string {
  const line =
    command
      ?.split('\n')
      .find((part) => part.trim())
      ?.trim() ?? ''
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}

function started(
  name: string,
  input: Record<string, unknown>,
  callId: string,
  at: number | null
): StartedShell | null {
  const label = text(input.description) ?? firstLine(text(input.command))
  if (name === 'Bash' && input.run_in_background === true) {
    return { callId, taskId: null, kind: 'command', label, ...(at ? { startedAt: at } : {}) }
  }
  if (name === 'Monitor') {
    const timeout = typeof input.timeout_ms === 'number' ? input.timeout_ms : null
    const expiresAt =
      at && input.persistent !== true ? at + (timeout ?? MONITOR_DEFAULT_TIMEOUT_MS) : undefined
    return {
      callId,
      taskId: null,
      kind: 'monitor',
      label,
      ...(at ? { startedAt: at } : {}),
      ...(expiresAt ? { expiresAt } : {})
    }
  }
  return null
}

/**
 * The shells and watches a terminal-backed Claude chat still runs, read from its transcript
 * (Paweł, 2026-11-09: "add visualization of running shells in chat ui"): a Bash call told to run
 * in the background, or a Monitor, runs from the result that gives its task id until Claude's
 * `<task-notification>` with a status, a TaskStop/KillShell naming it, or a Monitor's timeout.
 * A shell started before the loaded window is not listed.
 */
export function runningTranscriptBackgroundShells(
  messages: readonly NativeChatMessage[],
  now: number
): AgentSessionBackgroundTask[] {
  const byCallId = new Map<string, StartedShell>()
  const settle = (match: (shell: StartedShell) => boolean): void => {
    for (const [callId, shell] of byCallId) {
      if (match(shell)) {
        byCallId.delete(callId)
      }
    }
  }
  for (const message of messages) {
    for (const block of message.blocks) {
      if (isToolCallBlock(block) && block.callId) {
        const input = record(block.input)
        const shell = started(block.name, input, block.callId, message.timestamp)
        if (shell) {
          byCallId.set(block.callId, shell)
        } else if (block.name === 'TaskStop' || block.name === 'KillShell') {
          const stopped = text(input.task_id) ?? text(input.shell_id)
          settle((candidate) => candidate.taskId !== null && candidate.taskId === stopped)
        }
      } else if (isToolResultBlock(block) && block.callId) {
        const shell = byCallId.get(block.callId)
        if (!shell || shell.taskId !== null) {
          continue
        }
        const taskId = (shell.kind === 'monitor' ? MONITOR_ID : BACKGROUND_ID).exec(
          block.output
        )?.[1]
        // Why: no task id means it never went to the background (refused, failed, ran inline).
        if (block.isError || !taskId) {
          byCallId.delete(block.callId)
        } else {
          shell.taskId = taskId
        }
      } else if (message.role === 'user' && isTextBlock(block)) {
        const body = block.text.trim()
        const notice = readClaudeTaskNotification(body)
        // Why a status only: a Monitor's events reuse the tag without one while it keeps running.
        if (notice?.status) {
          const callId = NOTIFIED_CALL_ID.exec(body)?.[1]?.trim()
          settle((shell) => shell.taskId === notice.taskId || shell.callId === callId)
        }
      }
    }
  }
  const running: AgentSessionBackgroundTask[] = []
  for (const shell of byCallId.values()) {
    if (shell.taskId === null || (shell.expiresAt !== undefined && shell.expiresAt <= now)) {
      continue
    }
    running.push({
      id: shell.taskId,
      kind: shell.kind,
      ...(shell.label ? { description: shell.label } : {}),
      state: shell.kind === 'monitor' ? 'monitoring' : 'working',
      ...(shell.startedAt ? { startedAt: shell.startedAt } : {}),
      stoppable: false
    })
  }
  return running
}
