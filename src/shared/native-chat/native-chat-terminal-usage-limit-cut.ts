// A terminal chat's usage-limit cut, read from its transcript rows; the structured chat reads journal turns instead.

import type { NativeChatMessage } from './native-chat-types'
import type { NativeChatUsageLimitCut } from './native-chat-usage-limit-cut'

function usageLimitOf(
  message: NativeChatMessage
): Pick<NativeChatUsageLimitCut, 'turnItemId' | 'resetsAt'> | null {
  if (message.role !== 'system') {
    return null
  }
  for (const block of message.blocks) {
    if (
      block.type === 'text' &&
      block.failure?.kind === 'usageLimitReached' &&
      block.usageLimitTurnItemId !== undefined
    ) {
      const resetsAt = block.failure.usageLimit?.resetsAt
      return {
        turnItemId: block.usageLimitTurnItemId,
        ...(resetsAt !== undefined ? { resetsAt } : {})
      }
    }
  }
  return null
}

/**
 * The latest usage-limit row, when nothing came after it that the agent or the person said: no
 * message sent (a pending echo counts), no reply, no tool step. Local asides such as a command
 * marker leave the cut standing; a /clear removes the row itself.
 */
export function latestNativeChatTerminalUsageLimitCut(
  messages: readonly NativeChatMessage[]
): NativeChatUsageLimitCut | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message) {
      continue
    }
    const limit = usageLimitOf(message)
    if (limit) {
      return message.timestamp === null ? limit : { ...limit, turnEndedAt: message.timestamp }
    }
    if (message.role !== 'system') {
      return null
    }
  }
  return null
}
