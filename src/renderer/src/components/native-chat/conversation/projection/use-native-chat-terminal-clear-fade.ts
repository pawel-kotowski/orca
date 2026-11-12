import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import {
  latestClearSentAt,
  readCommandMarkerCache,
  type NativeChatCommandMarkerScope
} from '../../session/terminal/delivery/native-chat-command-marker'

/** The agent may never write a row after /clear; the fade ends on its own by then. */
export const NATIVE_CHAT_TERMINAL_CLEAR_FADE_MAX_MS = 2_500

/** A terminal /clear has landed once the agent writes after it, or its session changes. */
export function nativeChatTerminalClearSettled(input: {
  messages: readonly NativeChatMessage[]
  clearSentAt: number
  sessionIdAtClear: string | null
  sessionId: string | null
}): boolean {
  return (
    input.sessionId !== input.sessionIdAtClear ||
    input.messages.some(
      (message) =>
        message.source === 'transcript' &&
        message.timestamp !== null &&
        message.timestamp > input.clearSentAt
    )
  )
}

type Fade<S> = {
  /** The newest /clear this view has taken in; one sent before it mounted is no live clear. */
  handled: number | null
  /** The conversation as it was before the /clear, shown while it fades out. */
  frozen: S | null
  sessionIdAtClear: string | null
  /** Bumped when a clear lands, so the list starts over as the structured chat's does. */
  generation: number
}

/**
 * The structured chat's /clear fade for a terminal chat. A /clear sent from the composer cuts the
 * history at once (its command marker); this keeps the old conversation on screen, fading out,
 * until the agent writes after the clear, then shows the new one fresh.
 */
export function useNativeChatTerminalClearFade<
  S extends { messages: readonly NativeChatMessage[] }
>(
  scope: NativeChatCommandMarkerScope,
  session: S
): { session: S; clearing: boolean; generation: number } {
  // The markers' cache is what the pane's own state was built from this same render.
  const clearSentAt = latestClearSentAt(readCommandMarkerCache(scope))
  const lastLive = useRef(session)
  const [fade, setFade] = useState<Fade<S>>(() => ({
    handled: clearSentAt,
    frozen: null,
    sessionIdAtClear: scope.sessionId,
    generation: 0
  }))
  if (clearSentAt !== null && clearSentAt !== fade.handled) {
    setFade({
      handled: clearSentAt,
      frozen: lastLive.current,
      sessionIdAtClear: scope.sessionId,
      generation: fade.generation
    })
  } else if (
    fade.frozen !== null &&
    fade.handled !== null &&
    nativeChatTerminalClearSettled({
      messages: session.messages,
      clearSentAt: fade.handled,
      sessionIdAtClear: fade.sessionIdAtClear,
      sessionId: scope.sessionId
    })
  ) {
    setFade({ ...fade, frozen: null, generation: fade.generation + 1 })
  }
  const clearing = fade.frozen !== null
  useLayoutEffect(() => {
    if (!clearing) {
      lastLive.current = session
    }
  }, [clearing, session])
  useEffect(() => {
    if (!clearing) {
      return
    }
    const timer = setTimeout(
      () =>
        setFade((current) =>
          current.frozen === null
            ? current
            : { ...current, frozen: null, generation: current.generation + 1 }
        ),
      NATIVE_CHAT_TERMINAL_CLEAR_FADE_MAX_MS
    )
    return () => clearTimeout(timer)
  }, [clearing])
  return { session: fade.frozen ?? session, clearing, generation: fade.generation }
}
