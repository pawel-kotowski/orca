import {
  isToolCallBlock,
  type NativeChatBlock,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../../../../shared/native-chat/native-chat-types'
import { nativeChatToolCategory } from '../../../../shared/native-chat/tools/native-chat-tool-icon'
import { pairNativeChatToolResults } from '../../../../shared/native-chat/tools/native-chat-tool-pairing'

// Calls whose own line is the whole story; edits (diff cards), task lists and subagents keep
// the run that draws them.
const SOLE_LINE_CATEGORIES: ReadonlySet<string | null> = new Set<string | null>([
  'unknown',
  'mcpToolCall',
  'read',
  'search',
  'listFiles',
  'webSearch',
  'browser',
  'other'
])

/**
 * A run of exactly one call (and its result) draws as that call's own line: a header naming the one
 * step above a list holding only that step is a click with nothing behind it.
 */
export function nativeChatSoleToolCall(
  headerBlocks: readonly NativeChatBlock[]
): { call: NativeChatToolCallBlock; result: NativeChatToolResultBlock | undefined } | null {
  const calls = headerBlocks.filter(isToolCallBlock)
  const call = calls.length === 1 ? calls[0] : undefined
  if (!call || !SOLE_LINE_CATEGORIES.has(nativeChatToolCategory(call.name, call.mcpIdentity))) {
    return null
  }
  const { resultByCall, pairedResults } = pairNativeChatToolResults(headerBlocks)
  // Anything besides the call and its own result needs the run's list.
  const others = headerBlocks.filter((block) => block !== call && !pairedResults.has(block))
  return others.length === 0 ? { call, result: resultByCall.get(call) } : null
}
