// Claude Code writes a refused request as a synthetic assistant reply; a chat reads it as a status row.

import { agentSessionFailureWords } from '../../shared/agent-session/failures/agent-session-failure-words'
import {
  agentSessionFailureFact,
  providerDiagnostic
} from '../../shared/agent-session/failures/agent-session-failure'
import { usageLimitResetsAt } from '../../shared/agent-session/failures/agent-session-usage-limit'
import { structuredAgentSessionStatusBlock } from '../../shared/agent-session/view/structured-agent-session-status-block'
import type { NativeChatMessage } from '../../shared/native-chat/native-chat-types'
import { asRecord } from '../ai-vault/parsing/session-record-fields'
import { extractString } from '../../shared/trimmed-string'
import { CLAUDE_LIMIT_WINDOWS } from '../claude/structured/journal/claude-usage-limits'

function syntheticText(message: Record<string, unknown> | null): string {
  const content = message?.content
  if (typeof content === 'string') {
    return content.trim()
  }
  return Array.isArray(content)
    ? content
        .flatMap((part) => {
          const text = extractString(asRecord(part)?.text)
          return text ? [text] : []
        })
        .join('\n')
        .trim()
    : ''
}

/**
 * A usage-limit refusal becomes the same warning row the structured chat paints, so the terminal
 * chat can offer Continue and an account switch on it. Other rate refusals (usage credits run
 * out, a model that needs credits) are warnings without that fact: waiting for a reset does not
 * help them. Any other API error keeps its ordinary reply bubble.
 */
export function claudeApiErrorStatusMessage(
  record: Record<string, unknown>,
  timestamp: number | null
): Pick<NativeChatMessage, 'role' | 'blocks'> | null {
  if (record.type !== 'assistant' || record.isApiErrorMessage !== true) {
    return null
  }
  const usageLimit = record.apiError === 'usage_limit_reached'
  if (!usageLimit && record.error !== 'rate_limit') {
    return null
  }
  const text = syntheticText(asRecord(record.message))
  if (!usageLimit) {
    return text
      ? {
          role: 'system',
          blocks: [structuredAgentSessionStatusBlock({ kind: 'status', text, tone: 'warning' })]
        }
      : null
  }
  const info = asRecord(asRecord(record.apiErrorParams)?.rate_limit_info)
  const window = CLAUDE_LIMIT_WINDOWS[extractString(info?.rateLimitType) ?? '']
  const seconds = info?.resetsAt
  // Why the row's own time: a reset is judged against when the limit hit, not when it is read.
  const resetsAt =
    typeof seconds === 'number'
      ? usageLimitResetsAt(seconds * 1000, timestamp ?? Date.now())
      : undefined
  const row = agentSessionFailureWords(
    agentSessionFailureFact('usageLimitReached', {
      ...(window || resetsAt
        ? { usageLimit: { ...(window ? { window } : {}), ...(resetsAt ? { resetsAt } : {}) } }
        : {}),
      detail: providerDiagnostic(text, 'person')
    }),
    { agentName: 'Claude', provider: 'claude', surface: 'row' }
  )
  const turnItemId = extractString(record.uuid)
  return {
    role: 'system',
    blocks: [
      structuredAgentSessionStatusBlock(
        { kind: 'status', tone: 'warning', ...row },
        turnItemId ? { kind: 'turn', turnItemId } : undefined
      )
    ]
  }
}
