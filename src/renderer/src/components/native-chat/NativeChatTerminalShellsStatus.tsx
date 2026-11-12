import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { Activity, SquareTerminal } from 'lucide-react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import type { AgentSessionBackgroundTask } from '../../../../shared/agent-session/agent-session-background-task-wire'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { runningTranscriptBackgroundShells } from '../../../../shared/native-chat/transcript/native-chat-transcript-background-shells'
import { NativeChatActivityLine } from './NativeChatActivityLine'
import { formatNativeChatDuration } from '../../../../shared/native-chat/transcript/native-chat-turn-status'
import { NativeChatWorkersStrip } from './NativeChatWorkersStrip'

const NO_TASKS: readonly AgentSessionBackgroundTask[] = []

/**
 * The shells and watches a terminal-backed Claude chat has running (Paweł, 2026-11-09: "add
 * visualization of running shells in chat ui"), read from the transcript and shown only while
 * Claude still runs in the pane, since its shells end with it. One thin line above the message
 * box, side by side with their running time (2026-11-10: "one row for shells one for subagents
 * ... many shells in one row until expanded"); the pane's Orca workers get the line above it.
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
  const now = useNow(1_000, isVisible && tasks.length > 0)
  const linesRef = useRef<HTMLDivElement>(null)
  usePublishActivityLinesHeight(linesRef)
  const cells = tasks.map((task) => {
    const Icon = task.kind === 'monitor' ? Activity : SquareTerminal
    const label = task.description ?? task.name ?? task.id
    return {
      key: task.id,
      node: (
        <span title={label} className="flex h-4 w-full min-w-0 items-center gap-1">
          <Icon
            aria-hidden="true"
            className={`size-3 shrink-0 ${task.kind === 'monitor' ? 'text-yellow-500' : ''}`}
          />
          <span className="min-w-0 truncate text-chat-foreground">{label}</span>
          {task.startedAt !== undefined ? (
            <span className="shrink-0 font-mono tabular-nums">
              {formatNativeChatDuration(Math.max(0, (now - task.startedAt) / 1000))}
            </span>
          ) : null}
        </span>
      )
    }
  })
  return (
    <div ref={linesRef} data-native-chat-activity-lines="" className="flex shrink-0 flex-col">
      <NativeChatWorkersStrip paneKey={paneKey} />
      <NativeChatActivityLine kind="shells" cells={cells} />
    </div>
  )
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
