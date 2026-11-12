import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { NativeChatWorkersStrip } from './NativeChatWorkersStrip'
import { NativeChatBackgroundTasksStatus } from './tools/tasks/NativeChatBackgroundTasksStatus'
import type { NativeChatMessageListHandle } from './messages/actions/use-native-chat-reveal-latest'
import { useNativeChatClaudeSubagentTranscripts } from './native-chat-claude-subagents-store'
import {
  NO_SETTLED_BACKGROUND_TASKS,
  settleTerminalChatBackgroundTasks,
  terminalChatBackgroundTasks
} from './native-chat-terminal-background-tasks'

const NO_STOPPING: ReadonlySet<string> = new Set()
// Why a no-op: Claude Code offers no external stop for its tasks, so no row offers Stop.
const NO_STOP = (): void => {}

/**
 * The background work a terminal-backed Claude chat has running (Paweł, 2026-11-09: "add
 * visualization of running shells in chat ui"), in the structured chats' task strip above the
 * message box: its running subagents (each with Show agent, which opens its section in the
 * transcript) and its shells and watches, read from the transcript and shown only while Claude
 * still runs in the pane. The pane's Orca workers get the line above it.
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
  const turnRunning = useAppStore(
    (state) => state.agentStatusByPaneKey[paneKey]?.state === 'working'
  )
  const subagents = useNativeChatClaudeSubagentTranscripts(paneKey)
  // Why a slow clock: it only retires a Monitor past its timeout.
  const slowNow = useNow(30_000, isVisible && agentLive)
  const running = useMemo(
    () => terminalChatBackgroundTasks(messages, subagents, agentLive, slowNow),
    [agentLive, messages, subagents, slowNow]
  )
  const [held, setHeld] = useState(NO_SETTLED_BACKGROUND_TASKS)
  if (held.running !== running) {
    setHeld(settleTerminalChatBackgroundTasks(held, running))
  }
  const [expanded, setExpanded] = useState(false)
  const shown = running.length > 0
  const linesRef = useRef<HTMLDivElement>(null)
  usePublishActivityLinesHeight(linesRef, shown)
  return (
    <div ref={linesRef} data-native-chat-activity-lines="" className="flex shrink-0 flex-col">
      <NativeChatWorkersStrip paneKey={paneKey} />
      {shown ? (
        <NativeChatBackgroundTasksStatus
          isVisible={isVisible}
          tasks={running}
          settledTasks={held.settled}
          // A running turn owns the indicator; the strip speaks for the work only once it ends.
          indicatorActive={!turnRunning}
          supportsTaskStop={false}
          offersStopAll={false}
          stoppingTaskIds={NO_STOPPING}
          stoppingAll={false}
          expanded={expanded}
          onExpandedChange={setExpanded}
          onStop={NO_STOP}
          onShowAgent={(agentId) => messageListRef?.current?.revealSubagent(agentId)}
        />
      ) : null}
    </div>
  )
}

/**
 * Publish the lines' height on the chat root (`--native-chat-tasks-strip-height`), as the task
 * strip does, so Jump to latest, when it sits above the message box, sits above the lines too.
 * Why `shown` re-subscribes: the task strip publishes only its own height, and this observer,
 * created after it, reports last, so the whole height (workers line included) wins.
 */
function usePublishActivityLinesHeight(
  ref: RefObject<HTMLDivElement | null>,
  shown: boolean
): void {
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
  }, [ref, shown])
}
