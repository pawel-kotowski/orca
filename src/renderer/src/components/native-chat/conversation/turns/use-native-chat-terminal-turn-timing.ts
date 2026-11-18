import { useAgentStatusSelector } from '@/runtime/agent-status/use-agent-status'
import { useMemo } from 'react'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import type { NativeChatSettledTurns } from '../../../../../../shared/native-chat/transcript/turns/native-chat-turn-status'
import {
  nativeChatHookLatestTurnWorkedSeconds,
  nativeChatHookTurnStartedAt,
  nativeChatLatestTurnId,
  nativeChatTerminalSettledTurns,
  nativeChatTranscriptSettledTurns
} from '../../../../../../shared/native-chat/transcript/turns/native-chat-terminal-turn'
import { resolveNativeChatHookState } from '../../../../../../shared/native-chat/transcript/streaming/native-chat-live-status'
import { useNativeChatHeldByBackgroundWork } from '../../session/status/use-native-chat-hook-status'

/** Keep host live/latest-turn timing and historical transcript durations across pane remounts. */
export function useNativeChatTerminalTurnTiming(
  paneKey: string,
  messages: readonly NativeChatMessage[],
  turnActive: boolean
): {
  workingStartedAt: number | null
  settledTurns: NativeChatSettledTurns
  /** The agent ended its turn but waits on its own background work (passed to the list). */
  heldByBackgroundWork: boolean
} {
  const heldByBackgroundWork = useNativeChatHeldByBackgroundWork(paneKey)
  const turnStartedAt = useAgentStatusSelector(paneKey, nativeChatHookTurnStartedAt)
  const latestWorkedSeconds = useAgentStatusSelector(paneKey, (entry) =>
    nativeChatHookLatestTurnWorkedSeconds(entry, resolveNativeChatHookState(entry) === null)
  )
  const transcriptSettled = useMemo(() => nativeChatTranscriptSettledTurns(messages), [messages])
  const latestTurnId = useMemo(() => nativeChatLatestTurnId(messages), [messages])
  const settledTurns = useMemo(
    () =>
      nativeChatTerminalSettledTurns({
        transcriptSettled,
        latestTurnId,
        latestWorkedSeconds,
        turnStartedAt,
        turnActive
      }),
    [latestTurnId, latestWorkedSeconds, transcriptSettled, turnActive, turnStartedAt]
  )
  return { workingStartedAt: turnActive ? turnStartedAt : null, settledTurns, heldByBackgroundWork }
}
