import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import {
  nativeChatTurnAnswerRows,
  type NativeChatTurnFoldRow
} from '../../../../../../shared/native-chat/transcript/native-chat-turn-fold'
import type { NativeChatTranscriptSlot } from './native-chat-transcript-slots'

/**
 * Each turn's last answer row. Why: frame only a turn's last answer, never words the agent wrote
 * before a send-back, and only when they stand alone (a row with calls under its words is
 * commentary, not the answer).
 */
export function nativeChatFinalAnswerByTurn(
  foldRows: readonly NativeChatTurnFoldRow[],
  turnKeys: readonly (string | undefined)[]
): ReadonlyMap<string, number> {
  const finalAnswerByTurn = new Map<string, number>()
  for (const index of nativeChatTurnAnswerRows(foldRows)) {
    const turnKey = turnKeys[index]
    if (turnKey !== undefined && index > (finalAnswerByTurn.get(turnKey) ?? -1)) {
      finalAnswerByTurn.set(turnKey, index)
    }
  }
  return finalAnswerByTurn
}

/** The finished turn's answer, set apart from the work and commentary before it. */
export function isNativeChatFramedTurnAnswer(args: {
  message: NativeChatMessage
  index: number
  turnKey: string | undefined
  finalAnswerByTurn: ReadonlyMap<string, number>
  settledTurnKeys: ReadonlySet<string>
}): boolean {
  const { message, index, turnKey } = args
  // Why: with finished turns open, every finished turn's answer gets the same frame.
  return (
    turnKey !== undefined &&
    message.role === 'assistant' &&
    args.finalAnswerByTurn.get(turnKey) === index &&
    !message.blocks.some((block) => block.type === 'tool-call') &&
    args.settledTurnKeys.has(turnKey)
  )
}

/**
 * While the agent's turn is held open by its own background work (a shell, a Monitor), the words it
 * ended on are not its answer yet: the newest turn's answer loses its frame until that work ends.
 */
export function unframeHeldTurnAnswer(
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
