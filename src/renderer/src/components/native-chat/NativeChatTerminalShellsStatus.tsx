import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Activity, Bot, SquareTerminal } from 'lucide-react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { TranscriptBackgroundShell } from '../../../../shared/native-chat/transcript/native-chat-transcript-background-shells'
import { formatNativeChatDuration } from '../../../../shared/native-chat/transcript/native-chat-turn-status'
import { NativeChatActivityLine, type NativeChatActivityCell } from './NativeChatActivityLine'
import { NativeChatWorkersStrip } from './NativeChatWorkersStrip'
import type { NativeChatMessageListHandle } from './messages/actions/use-native-chat-reveal-latest'
import { useNativeChatClaudeSubagentTranscripts } from './native-chat-claude-subagents-store'
import { terminalChatBackgroundTasks } from './native-chat-terminal-background-tasks'

/**
 * The background work a terminal-backed Claude chat has running (Paweł, 2026-11-09: "add
 * visualization of running shells in chat ui"), read from the transcript and shown only while
 * Claude still runs in the pane. Paweł's own design, kept over upstream's task list (2026-11-12:
 * upstream's "1 shell command" box hid what runs until clicked, then took three rows to show one
 * command, cut short): one thin line per kind above the message box (2026-11-10: "one row for
 * shells one for subagents ... many shells in one row until expanded"), each item named, with its
 * running time. A subagent opens its place in the transcript; a shell shows its full command on
 * hover. The pane's Orca workers get the line above them.
 */
export function NativeChatTerminalShellsStatus({
  session,
  paneKey,
  isVisible,
  messageListRef
}: {
  session: { messages: readonly NativeChatMessage[] }
  paneKey: string
  isVisible: boolean
  messageListRef?: RefObject<NativeChatMessageListHandle | null>
}): React.JSX.Element {
  const messages = session.messages
  const agentLive = useAppStore((state) => Boolean(state.agentStatusByPaneKey[paneKey]))
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
    const elapsed =
      task.startedAt !== undefined ? (
        <span className="shrink-0 font-mono tabular-nums">
          {formatNativeChatDuration(Math.max(0, (now - task.startedAt) / 1000))}
        </span>
      ) : null
    if (task.kind === 'agent') {
      agentCells.push({
        key: task.id,
        node: (
          <button
            type="button"
            title={label}
            onClick={() => messageListRef?.current?.revealSubagent(task.id)}
            className="flex h-4 w-full min-w-0 cursor-pointer items-center gap-1 rounded text-left outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Bot aria-hidden="true" className="size-3 shrink-0" />
            <span className="min-w-0 truncate text-chat-foreground">{label}</span>
            {elapsed}
          </button>
        )
      })
      continue
    }
    shellCells.push(shellCell(task, label, elapsed))
  }
  return (
    <div ref={linesRef} data-native-chat-activity-lines="" className="flex shrink-0 flex-col">
      <NativeChatWorkersStrip paneKey={paneKey} />
      <NativeChatActivityLine kind="subagents" cells={agentCells} />
      <NativeChatActivityLine kind="shells" cells={shellCells} />
    </div>
  )
}

function shellCell(
  task: TranscriptBackgroundShell,
  label: string,
  elapsed: React.ReactNode
): NativeChatActivityCell {
  const Icon = task.kind === 'monitor' ? Activity : SquareTerminal
  // Why the command on hover: the line names a shell by Claude's description of it.
  const hover = task.command && task.command !== label ? `${label}\n${task.command}` : label
  return {
    key: task.id,
    node: (
      <span title={hover} className="flex h-4 w-full min-w-0 items-center gap-1">
        <Icon
          aria-hidden="true"
          className={`size-3 shrink-0 ${task.kind === 'monitor' ? 'text-yellow-500' : ''}`}
        />
        <span className="min-w-0 truncate text-chat-foreground">{label}</span>
        {elapsed}
      </span>
    )
  }
}

/**
 * Publish the lines' height on the chat root (`--native-chat-tasks-strip-height`), as the task
 * strip does, so Jump to latest, when it sits above the message box, sits above the lines too.
 */
function usePublishActivityLinesHeight(ref: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current
    const root = element?.closest<HTMLElement>('[data-native-chat-root="true"]')
    if (!element || !root || typeof ResizeObserver === 'undefined') {
      return
    }
    const publish = (): void =>
      root.style.setProperty('--native-chat-tasks-strip-height', `${element.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--native-chat-tasks-strip-height')
    }
  }, [ref])
}
