import { useMemo, useRef } from 'react'
import { useAgentStatus } from '@/runtime/agent-status/use-agent-status'
import { useNow } from '@/lib/window-activity/use-now'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { NativeChatActivityLine, type NativeChatActivityCell } from './NativeChatActivityLine'
import { NativeChatWorkersStrip } from './NativeChatWorkersStrip'
import { useNativeChatClaudeSubagentTranscripts } from './native-chat-claude-subagents-store'
import { openNativeChatSubagent } from './subagents/native-chat-open-subagent'
import { terminalChatBackgroundTasks } from './native-chat-terminal-background-tasks'
import { nativeChatRunningWorkCell } from './native-chat-running-work-cells'
import { usePublishActivityLinesHeight } from './use-publish-activity-lines-height'

/**
 * The background work a terminal-backed Claude chat has running (Paweł, 2026-11-09: "add
 * visualization of running shells in chat ui"), read from the transcript and shown only while
 * Claude still runs in the pane. Paweł's own design, kept over upstream's task list (2026-11-12:
 * upstream's "1 shell command" box hid what runs until clicked, then took three rows to show one
 * command, cut short): one thin line per kind above the message box (2026-11-10: "one row for
 * shells one for subagents ... many shells in one row until expanded"), each item named, with its
 * running time. A subagent opens its own transcript view; a shell shows its full command on
 * hover. The pane's Orca workers get the line above them.
 */
export function NativeChatTerminalShellsStatus({
  session,
  paneKey,
  isVisible
}: {
  session: { messages: readonly NativeChatMessage[] }
  paneKey: string
  isVisible: boolean
}): React.JSX.Element {
  const messages = session.messages
  const agentLive = Boolean(useAgentStatus(paneKey))
  const subagents = useNativeChatClaudeSubagentTranscripts(paneKey)
  // Why a slow clock: it only retires a Monitor past its timeout.
  const slowNow = useNow(30_000, isVisible && agentLive)
  const tasks = useMemo(
    () => terminalChatBackgroundTasks(messages, subagents, agentLive, slowNow),
    [agentLive, messages, subagents, slowNow]
  )
  const now = useNow(1_000, isVisible && tasks.length > 0)
  const linesRef = useRef<HTMLDivElement>(null)
  usePublishActivityLinesHeight(linesRef)
  const agentCells: NativeChatActivityCell[] = []
  const shellCells: NativeChatActivityCell[] = []
  for (const task of tasks) {
    const label = task.description ?? task.name ?? task.id
    const agent = task.kind === 'agent'
    ;(agent ? agentCells : shellCells).push(
      nativeChatRunningWorkCell(
        {
          id: task.id,
          kind: task.kind,
          label,
          // Why the command on hover: the line names a shell by Claude's description of it.
          ...(task.command && task.command !== label ? { hover: `${label}\n${task.command}` } : {}),
          ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
          ...(agent ? { onOpen: () => openNativeChatSubagent(paneKey, task.id) } : {})
        },
        now
      )
    )
  }
  return (
    <div ref={linesRef} data-native-chat-activity-lines="" className="flex shrink-0 flex-col">
      <NativeChatWorkersStrip paneKey={paneKey} />
      <NativeChatActivityLine kind="subagents" cells={agentCells} />
      <NativeChatActivityLine kind="shells" cells={shellCells} />
    </div>
  )
}
