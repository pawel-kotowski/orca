import { useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import type { AgentSessionBackgroundTask } from '../../../../shared/agent-session/agent-session-background-task-wire'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { runningTranscriptBackgroundShells } from '../../../../shared/native-chat/transcript/native-chat-transcript-background-shells'
import { NativeChatBackgroundTasksStatus } from './NativeChatBackgroundTasksStatus'

const NO_TASKS: readonly AgentSessionBackgroundTask[] = []
const NO_STOPS: ReadonlySet<string> = new Set()

/**
 * The shells and watches a terminal-backed Claude chat has running, in the strip structured
 * chats use for background tasks (Paweł, 2026-11-09: "add visualization of running shells in chat
 * ui"). Read from the transcript; shown only while Claude still runs in the pane, since its shells
 * end with it.
 */
export function NativeChatTerminalShellsStatus({
  session,
  paneKey,
  isVisible,
  turnActive
}: {
  session: { messages: readonly NativeChatMessage[] }
  paneKey: string
  isVisible: boolean
  turnActive: boolean
}): React.JSX.Element | null {
  const messages = session.messages
  const agentLive = useAppStore((state) => Boolean(state.agentStatusByPaneKey[paneKey]))
  // Why a slow clock: it only retires a Monitor past its timeout.
  const now = useNow(30_000, isVisible && agentLive)
  const tasks = useMemo(
    () => (agentLive ? runningTranscriptBackgroundShells(messages, now) : NO_TASKS),
    [agentLive, messages, now]
  )
  const [expanded, setExpanded] = useState(false)
  if (tasks.length === 0) {
    return null
  }
  return (
    <NativeChatBackgroundTasksStatus
      tasks={tasks}
      settledTasks={NO_TASKS}
      supportsTaskStop={false}
      offersStopAll={false}
      stoppingTaskIds={NO_STOPS}
      stoppingAll={false}
      indicatorActive={!turnActive}
      isVisible={isVisible}
      expanded={expanded}
      onExpandedChange={setExpanded}
      onStop={() => {}}
    />
  )
}
