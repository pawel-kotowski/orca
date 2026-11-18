// Local build's additions to the Claude transcript decoder, kept beside it so the upstream file
// stays under its line limit.
import type { NativeChatMessage } from '../../../shared/native-chat/native-chat-types'
import { asRecord } from '../../ai-vault/parsing/session-record-fields'
import { extractString } from '../../../shared/text/trimmed-string'
import { timestampMs } from '../../ai-vault/parsing/session-record-time'
import { claudeTokenUsage } from '../../claude/context-usage/claude-context-usage'

/** A background task's `<task-notification>` user row: Claude starts a turn to read it. */
export function isClaudeTaskNotificationRecord(record: Record<string, unknown>): boolean {
  return asRecord(record.origin)?.kind === 'task-notification'
}

/** The model that answered and its token accounting, which say how full the context window is. */
export function claudeServing(
  record: Record<string, unknown>,
  message: Record<string, unknown> | null
): Pick<NativeChatMessage, 'model' | 'usage'> {
  // A subagent's reply measures the subagent's context, not this conversation's.
  if (record.isSidechain === true) {
    return {}
  }
  const model = extractString(message?.model)
  // Synthetic rows (API errors, interruptions) report zero usage and say nothing about the window.
  const usage = claudeTokenUsage(message?.usage)
  return usage ? { ...(model ? { model } : {}), usage } : {}
}

/** Claude Code's away recap (`※ recap` in its terminal) is a system row; show it as quiet status, not drop it. */
export function claudeRecapMessage(
  record: Record<string, unknown>,
  fallbackId: string
): NativeChatMessage | null {
  if (record.type !== 'system' || record.subtype !== 'away_summary') {
    return null
  }
  const text = extractString(record.content)
    ?.replace(/\s*\(disable recaps in \/config\)\s*$/, '')
    .trim()
  if (!text) {
    return null
  }
  const parentUuid = extractString(record.parentUuid)
  const timestamp = timestampMs(record.timestamp)
  return {
    id: extractString(record.uuid) ?? fallbackId,
    role: 'system',
    blocks: [{ type: 'text', text: `Recap: ${text}` }],
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    source: 'transcript',
    ...(parentUuid ? { parentId: parentUuid } : {})
  }
}

/** The chat read's turn marker keeps the notification's own text (the row still draws only its
 *  bar), so the terminal chat's shells and subagents strips read the task's end from it. */
export function claudeTaskNotificationMarkerText(notice: NativeChatMessage | null): string {
  const text = notice?.blocks
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim()
  return text?.startsWith('<task-notification>') ? text : '<task-notification>'
}
