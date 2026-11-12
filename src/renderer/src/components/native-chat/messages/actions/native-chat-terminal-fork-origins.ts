import { useSyncExternalStore } from 'react'
import { AGENT_SESSION_FORKED_FROM_PRESENTATION } from '../../../../../../shared/agent-session/agent-session-fork'
import { NATIVE_CHAT_NOTICE_COPY } from '../../../../../../shared/native-chat/native-chat-notice'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'

/** Where a terminal chat's copy came from, for its "Forked from" divider. */
export type NativeChatTerminalForkOrigin = {
  sourceSessionId: string
  sourceTabId: string
  worktreeId: string
  sourceName: string
  /** The copy's last row: the divider goes after it. */
  throughUuid: string
  forkedAt: number
}

// Session-only, keyed by the copy's own session id: a restart forgets it, and the divider with it.
const origins = new Map<string, NativeChatTerminalForkOrigin>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function rememberNativeChatTerminalForkOrigin(
  copySessionId: string,
  origin: NativeChatTerminalForkOrigin
): void {
  origins.set(copySessionId, origin)
  listeners.forEach((listener) => listener())
}

export function useNativeChatTerminalForkOrigin(
  sessionId: string | null
): NativeChatTerminalForkOrigin | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (sessionId ? origins.get(sessionId) : undefined),
    () => undefined
  )
}

/** The newest fork made from `sourceSessionId`, for the divider's link back to it. */
export function findNativeChatTerminalForkSource(
  sourceSessionId: string
): NativeChatTerminalForkOrigin | undefined {
  return [...origins.values()].findLast((origin) => origin.sourceSessionId === sourceSessionId)
}

/** The copy's rows, then the divider, then what the new chat added. Placed after the copy's last
 *  row when the chat draws it, else before the first row newer than the fork. */
export function withNativeChatTerminalForkDivider(
  messages: readonly NativeChatMessage[],
  copySessionId: string,
  origin: NativeChatTerminalForkOrigin
): NativeChatMessage[] {
  const through = messages.findIndex((message) => message.id === origin.throughUuid)
  const newer = messages.findIndex(
    (message) => message.timestamp !== null && message.timestamp > origin.forkedAt
  )
  const at = through !== -1 ? through + 1 : newer !== -1 ? newer : messages.length
  const divider: NativeChatMessage = {
    id: `terminal-fork-divider:${copySessionId}`,
    role: 'system',
    blocks: [
      {
        type: 'text',
        text: `${NATIVE_CHAT_NOTICE_COPY.forkedFrom} ${origin.sourceName}`,
        presentation: AGENT_SESSION_FORKED_FROM_PRESENTATION,
        forkedFrom: { sessionId: origin.sourceSessionId }
      }
    ],
    timestamp: messages[at - 1]?.timestamp ?? origin.forkedAt,
    source: 'transcript',
    // Byte offsets are whole numbers, so half past its predecessor sorts it before the next row.
    ...(messages[at - 1]?.transcriptOrder !== undefined
      ? { transcriptOrder: messages[at - 1]!.transcriptOrder! + 0.5 }
      : {})
  }
  return [...messages.slice(0, at), divider, ...messages.slice(at)]
}
