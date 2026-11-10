import { useMemo, useRef, useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import type { AgentSessionBackgroundTask } from '../../../../shared/agent-session/agent-session-background-task-wire'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { runningTranscriptBackgroundShells } from '../../../../shared/native-chat/transcript/native-chat-transcript-background-shells'
import { BackgroundTaskRow } from './NativeChatBackgroundTasksStatus'
import { buildBackgroundTaskGroups } from './background-task-roster'
import { NativeChatFooterChip } from './native-chat-footer-slot'
import { formatNativeChatDuration } from './NativeChatWorkingStatus'
import { NativeChatWorkersStrip } from './NativeChatWorkersStrip'

const NO_TASKS: readonly AgentSessionBackgroundTask[] = []
const NO_STOPS: ReadonlySet<string> = new Set()

/**
 * The shells and watches a terminal-backed Claude chat has running (Paweł, 2026-11-09: "add
 * visualization of running shells in chat ui"), read from the transcript and shown only while
 * Claude still runs in the pane, since its shells end with it. They take no space until asked
 * (2026-11-10: "they should take no space until i click ... even if there are many running i dont
 * need header row"): a chip under the message box with their count and the oldest one's time
 * opens their rows above the box. The pane's Orca workers sit beside them.
 */
export function NativeChatTerminalShellsStatus({
  session,
  paneKey,
  isVisible
}: {
  session: { messages: readonly NativeChatMessage[] }
  paneKey: string
  isVisible: boolean
  turnActive: boolean
}): React.JSX.Element {
  const messages = session.messages
  const agentLive = useAppStore((state) => Boolean(state.agentStatusByPaneKey[paneKey]))
  // Why a slow clock: it only retires a Monitor past its timeout.
  const slowNow = useNow(30_000, isVisible && agentLive)
  const tasks = useMemo(
    () => (agentLive ? runningTranscriptBackgroundShells(messages, slowNow) : NO_TASKS),
    [agentLive, messages, slowNow]
  )
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLSpanElement>(null)
  const now = useNow(1_000, isVisible && tasks.length > 0)
  const rows = useMemo(
    () =>
      buildBackgroundTaskGroups(tasks, NO_TASKS).flatMap((group) =>
        group.tasks.map((entry) => entry.row)
      ),
    [tasks]
  )
  const oldest = tasks.reduce<number | null>(
    (first, task) =>
      task.startedAt !== undefined && (first === null || task.startedAt < first)
        ? task.startedAt
        : first,
    null
  )
  const label = `${tasks.length} running ${tasks.length === 1 ? 'shell' : 'shells'}`
  return (
    <>
      <NativeChatWorkersStrip paneKey={paneKey} />
      <span ref={anchor} hidden />
      {tasks.length > 0 ? (
        <NativeChatFooterChip
          anchor={anchor}
          pressed={open}
          title={label}
          onClick={() => setOpen(!open)}
        >
          <SquareTerminal aria-hidden="true" className="size-3 shrink-0" />
          <span className="tabular-nums">
            {tasks.length}
            {oldest !== null
              ? ` · ${formatNativeChatDuration(Math.max(0, (now - oldest) / 1000))}`
              : ''}
          </span>
        </NativeChatFooterChip>
      ) : null}
      {open && rows.length > 0 ? (
        <div
          data-native-chat-background-tasks="true"
          className="shrink-0 bg-chat-pane px-3 pt-2 sm:px-4"
        >
          <div className="mx-auto w-full max-w-(--chat-content-max-width)">
            <ul
              role="list"
              aria-label={label}
              className="scrollbar-sleek max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-muted/50 px-3 py-1 text-xs text-muted-foreground shadow-xs"
            >
              {rows.map((row) => (
                <BackgroundTaskRow
                  key={row.id}
                  row={row}
                  now={now}
                  supportsTaskStop={false}
                  stoppingTaskIds={NO_STOPS}
                  onStop={() => {}}
                />
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  )
}
