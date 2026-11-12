/** Claude Code's `/goal` as its terminal records it (checked against a 2.1.322 transcript): the
 *  command's echoed output says "Goal set: …" on a user row, an evaluation that passes is a
 *  `goal_status` attachment with `met: true`, and a `/goal clear` sent while idle is a system
 *  `local_command` row. Structured sessions read the same goal from stream-json instead
 *  (claude-thread-goal.ts). */
import type {
  AgentJournalThreadGoal,
  AgentJournalThreadGoalState
} from '../../shared/agent-session/journal/agent-session-journal-types'
import type { NativeChatBlock, NativeChatMessage } from '../../shared/native-chat/native-chat-types'
import { asRecord } from '../ai-vault/parsing/session-record-fields'
import { extractString } from '../../shared/trimmed-string'
import { timestampMs } from '../ai-vault/parsing/session-record-time'

const LOCAL_COMMAND_STDOUT = /^\s*<local-command-stdout>([\s\S]*)<\/local-command-stdout>\s*$/
const GOAL_SET = 'Goal set: '
// The bare `/goal` report, with an optional "Last check: …" line after it.
const GOAL_ACTIVE = /^Goal active: ([\s\S]+?) \((?:not yet evaluated|\d+ turns?)\)(?:\n|$)/u

function goal(
  objective: string,
  status: AgentJournalThreadGoal['status'],
  at: number
): AgentJournalThreadGoal {
  return {
    objective,
    status,
    tokenBudget: null,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt: at,
    updatedAt: at
  }
}

/** What a `/goal` command's output says about the goal, or null for any other output. */
export function claudeGoalCommandOutputState(
  output: string,
  at: number
): AgentJournalThreadGoalState | null {
  const text = output.trim()
  if (text.startsWith(GOAL_SET)) {
    const objective = text.slice(GOAL_SET.length).trim()
    return objective ? { state: 'set', goal: goal(objective, 'active', at) } : null
  }
  // Includes "Goal cleared after an unrecoverable error (…)".
  if (text.startsWith('Goal cleared') || text === 'No goal set') {
    return { state: 'cleared' }
  }
  const active = GOAL_ACTIVE.exec(text)?.[1]?.trim()
  return active ? { state: 'set', goal: goal(active, 'active', at) } : null
}

function recordTime(record: Record<string, unknown>): number | null {
  const parsed = timestampMs(record.timestamp)
  return Number.isFinite(parsed) ? parsed : null
}

/** A goal row Claude writes as its own record (a passed evaluation, or an idle `/goal` command's
 *  output), as a quiet status row carrying the goal; null for every other record. */
export function claudeTerminalGoalRow(
  record: Record<string, unknown>,
  fallbackId: string
): NativeChatMessage | null {
  const timestamp = recordTime(record)
  const at = timestamp ?? 0
  let text: string | null = null
  let threadGoal: AgentJournalThreadGoalState | null = null
  if (record.type === 'attachment') {
    const attachment = asRecord(record.attachment)
    const condition = extractString(attachment?.condition)
    // An unmet evaluation leaves the goal as it was; Claude's Stop feedback row already says why.
    if (attachment?.type !== 'goal_status' || attachment.met !== true || !condition) {
      return null
    }
    text = `Goal complete: ${condition}`
    threadGoal = { state: 'set', goal: goal(condition, 'complete', at) }
  } else if (record.type === 'system' && record.subtype === 'local_command') {
    const output = LOCAL_COMMAND_STDOUT.exec(extractString(record.content) ?? '')?.[1]
    threadGoal = output ? claudeGoalCommandOutputState(output, at) : null
    text = threadGoal ? output!.trim() : null
  }
  if (!text || !threadGoal) {
    return null
  }
  const parentId = extractString(record.parentUuid)
  return {
    id: extractString(record.uuid) ?? fallbackId,
    role: 'system',
    blocks: [{ type: 'text', text }],
    timestamp,
    source: 'transcript',
    threadGoal,
    ...(parentId ? { parentId } : {})
  }
}

/** The goal a `/goal` command's echoed output carries on its user row (Claude writes "Goal set"
 *  there, since setting a goal starts a turn). */
export function claudeTerminalGoalOnUserRow(
  blocks: readonly NativeChatBlock[],
  timestamp: number | null
): Pick<NativeChatMessage, 'threadGoal'> {
  const [block] = blocks
  if (blocks.length !== 1 || block?.type !== 'text') {
    return {}
  }
  const output = LOCAL_COMMAND_STDOUT.exec(block.text)?.[1]
  const threadGoal = output ? claudeGoalCommandOutputState(output, timestamp ?? 0) : null
  return threadGoal ? { threadGoal } : {}
}
