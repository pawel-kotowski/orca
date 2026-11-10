// Claude Code's own subagents in a terminal-backed chat: the rows read from each subagent's
// transcript join the session's, and every spawn gets the roster row the structured lane's journal
// writes (a `subagent` block at the spawning call), so the chat draws the same subagent sections.

import type {
  NativeChatMessage,
  NativeChatSubagentBlock,
  NativeChatSubagentState
} from '../native-chat-types'
import type { NativeChatSubagentTranscript } from '../native-chat-subagent-transcripts'
import { subagentFallbackText } from './native-chat-subagent-items'

const SPAWN_TOOLS = new Set(['Agent', 'Task'])
const TASK_NOTIFICATION =
  /<task-id>([^<\s]+)<\/task-id>[\s\S]*?<status>([a-z_]+)<\/status>|<status>([a-z_]+)<\/status>[\s\S]*?<task-id>([^<\s]+)<\/task-id>/g

type Spawn = { message: NativeChatMessage; resultError: boolean; resultText: string | null }

/** Whether the conversation has a Claude subagent spawn, so a reader knows to look for files. */
export function hasClaudeSubagentSpawn(messages: readonly NativeChatMessage[]): boolean {
  return messages.some((message) =>
    message.blocks.some((block) => block.type === 'tool-call' && SPAWN_TOOLS.has(block.name))
  )
}

function textOf(output: unknown): string | null {
  if (typeof output === 'string') {
    return output
  }
  if (Array.isArray(output)) {
    const parts = output
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : ''
      )
      .filter(Boolean)
    return parts.length > 0 ? parts.join('\n') : null
  }
  return null
}

function indexSpawns(rows: readonly NativeChatMessage[], spawns: Map<string, Spawn>): void {
  for (const message of rows) {
    for (const block of message.blocks) {
      if (block.type === 'tool-call' && SPAWN_TOOLS.has(block.name) && block.callId) {
        if (!spawns.has(block.callId)) {
          spawns.set(block.callId, { message, resultError: false, resultText: null })
        }
      }
    }
  }
  for (const message of rows) {
    for (const block of message.blocks) {
      if (block.type !== 'tool-result' || !block.callId) {
        continue
      }
      const spawn = spawns.get(block.callId)
      if (spawn) {
        spawn.resultError = block.isError === true
        spawn.resultText = textOf(block.output) ?? ''
      }
    }
  }
}

/** Background subagents end with a `<task-notification>` naming their id and status. */
function notifiedStates(rows: readonly NativeChatMessage[]): Map<string, string> {
  const states = new Map<string, string>()
  for (const message of rows) {
    if (message.role !== 'user' && message.role !== 'system') {
      continue
    }
    for (const block of message.blocks) {
      if (block.type !== 'text' || !block.text.includes('<task-id>')) {
        continue
      }
      for (const match of block.text.matchAll(TASK_NOTIFICATION)) {
        const id = match[1] ?? match[4]
        const status = match[2] ?? match[3]
        if (id && status) {
          states.set(id, status)
        }
      }
    }
  }
  return states
}

function stateOf(
  subagent: NativeChatSubagentTranscript,
  spawn: Spawn,
  notified: string | undefined,
  sessionLive: boolean
): NativeChatSubagentState {
  if (notified === 'failed' || notified === 'error') {
    return 'failed'
  }
  if (notified === 'killed' || notified === 'stopped' || notified === 'cancelled') {
    return 'stopped'
  }
  if (notified === 'completed' || subagent.finished === true) {
    return spawn.resultError ? 'failed' : 'completed'
  }
  // A foreground subagent's result is its answer; a background one's result only says it started.
  const launchedOnly = spawn.resultText !== null && /agent launched/i.test(spawn.resultText)
  if (spawn.resultText !== null && !launchedOnly) {
    return spawn.resultError ? 'failed' : 'completed'
  }
  return sessionLive ? 'working' : 'unverifiable'
}

/**
 * The session's rows with its subagents' rows and one roster row per spawn. A roster row sits at
 * its spawning call (same clock), in the spawner's own rows when a subagent spawned it.
 */
export function mergeClaudeSubagents(
  messages: readonly NativeChatMessage[],
  subagents: readonly NativeChatSubagentTranscript[],
  sessionLive: boolean
): NativeChatMessage[] {
  if (subagents.length === 0) {
    return messages as NativeChatMessage[]
  }
  const spawns = new Map<string, Spawn>()
  const childRows = subagents.flatMap((subagent) => subagent.messages)
  indexSpawns(messages, spawns)
  indexSpawns(childRows, spawns)
  const notified = notifiedStates(messages)
  const known = new Set(subagents.map((subagent) => subagent.agentId))
  const rosterRows: NativeChatMessage[] = []
  for (const subagent of subagents) {
    const spawn = subagent.toolUseId ? spawns.get(subagent.toolUseId) : undefined
    if (!spawn) {
      continue
    }
    const state = stateOf(subagent, spawn, notified.get(subagent.agentId), sessionLive)
    const parent =
      subagent.parentAgentId && known.has(subagent.parentAgentId) ? subagent.parentAgentId : null
    const block: NativeChatSubagentBlock = {
      type: 'subagent',
      id: subagent.agentId,
      label: subagent.description ?? subagent.agentType ?? 'Subagent',
      state,
      // Why the spawning message: siblings one reply spawned draw as one roster.
      groupId: spawn.message.id,
      ...(parent ? { parentId: parent } : {}),
      ...(subagent.startedAt !== null ? { startedAt: subagent.startedAt } : {}),
      ...(state !== 'working' && subagent.updatedAt !== null
        ? { settledAt: subagent.updatedAt }
        : {})
    }
    rosterRows.push({
      id: `subagent-roster:${subagent.agentId}`,
      role: 'system',
      blocks: [{ type: 'text', text: subagentFallbackText(block) }, block],
      timestamp: spawn.message.timestamp,
      source: 'hook',
      ...(parent ? { agentId: parent } : {})
    })
  }
  return [...messages, ...rosterRows, ...childRows]
}
