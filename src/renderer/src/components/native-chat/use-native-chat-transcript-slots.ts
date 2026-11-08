import { useMemo } from 'react'
import {
  nativeChatLiveLine,
  type NativeChatLiveLine
} from '../../../../shared/native-chat/transcript/native-chat-live-line'
import { isNativeChatRowInLiveWorkingTurn } from '../../../../shared/native-chat/transcript/native-chat-live-turn-membership'
import {
  buildNativeChatTranscriptSlots,
  type NativeChatTranscriptSlot,
  type NativeChatTranscriptSlotsInput
} from './native-chat-transcript-slots'

/** Choose slots/activity together so reasoning shown by the activity line never also gets a transcript row. */
/**
 * While the agent's turn is held open by its own background work (a shell, a Monitor), the words it
 * ended on are not its answer yet: the newest turn's answer loses its frame until that work ends.
 */
function unframeHeldTurnAnswer(
  slots: NativeChatTranscriptSlot[],
  turnKeys: readonly (string | undefined)[]
): NativeChatTranscriptSlot[] {
  const lastTurnKey = turnKeys.findLast((key) => key !== undefined)
  const index = slots.findLastIndex(
    (slot) => slot.kind === 'message' && slot.turnAnswer === true && slot.turnKey === lastTurnKey
  )
  if (index === -1) {
    return slots
  }
  const next = [...slots]
  next[index] = { ...next[index]!, turnAnswer: false } as NativeChatTranscriptSlot
  return next
}

export function useNativeChatTranscriptSlots({
  line,
  heldByBackgroundWork = false,
  ...input
}: Omit<NativeChatTranscriptSlotsInput, 'liveReasoningId'> & {
  line: { draws: boolean; thinking: boolean; stopping?: boolean; activityText?: string | null }
  /** The agent ended its turn but waits on its own background work. */
  heldByBackgroundWork?: boolean
}): { slots: NativeChatTranscriptSlot[]; liveLine: NativeChatLiveLine | null } {
  const {
    messages,
    unresolvedRowIds,
    typography,
    turnKeys,
    liveTurnKey,
    receipts,
    turnStatuses,
    turnDiffs,
    expandedTurnKeys,
    isWorking,
    lifecycleWorking,
    subagentSections,
    subagentChoices
  } = input
  const { draws, thinking, stopping = false, activityText } = line
  const liveLine = useMemo(
    () =>
      nativeChatLiveLine({
        draws,
        thinking,
        stopping,
        activityText,
        messages,
        inLiveWorkingTurn: (index) =>
          isNativeChatRowInLiveWorkingTurn(
            turnKeys[index],
            liveTurnKey,
            isWorking || lifecycleWorking,
            unresolvedRowIds?.has(messages[index]!.id)
          )
      }),
    [
      activityText,
      draws,
      isWorking,
      lifecycleWorking,
      liveTurnKey,
      messages,
      stopping,
      thinking,
      turnKeys,
      unresolvedRowIds
    ]
  )
  const liveReasoningId = liveLine?.reasoning?.message.id ?? null
  const slots = useMemo(
    () =>
      buildNativeChatTranscriptSlots({
        messages,
        unresolvedRowIds,
        typography,
        turnKeys,
        liveTurnKey,
        receipts,
        turnStatuses,
        turnDiffs,
        expandedTurnKeys,
        isWorking,
        lifecycleWorking,
        subagentSections,
        subagentChoices,
        liveReasoningId
      }),
    [
      expandedTurnKeys,
      isWorking,
      lifecycleWorking,
      liveReasoningId,
      liveTurnKey,
      messages,
      receipts,
      subagentChoices,
      subagentSections,
      turnDiffs,
      turnKeys,
      turnStatuses,
      typography,
      unresolvedRowIds
    ]
  )
  const shownSlots = useMemo(
    () => (heldByBackgroundWork ? unframeHeldTurnAnswer(slots, turnKeys) : slots),
    [heldByBackgroundWork, slots, turnKeys]
  )
  return { slots: shownSlots, liveLine }
}
