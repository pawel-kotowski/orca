// Claude Code's own subagents in a terminal-backed chat: the rows read from each subagent's
// transcript join the session's, and every spawn gets the roster row the structured lane's journal
// writes (a `subagent` block at the spawning call), so the chat draws the same subagent sections.

import type {
  NativeChatBlock,
  NativeChatMessage,
  NativeChatSubagentBlock,
  NativeChatSubagentState
} from '../native-chat-types'
import type { NativeChatSubagentTranscript } from '../native-chat-subagent-transcripts'
import { subagentFallbackText } from './native-chat-subagent-items'
import { isNoiseMessage } from '../native-chat-noise'

const SPAWN_TOOLS = new Set(['Agent', 'Task'])
const TASK_NOTIFICATION =
  /<task-id>([^<\s]+)<\/task-id>[\s\S]*?<status>([a-z_]+)<\/status>|<status>([a-z_]+)<\/status>[\s\S]*?<task-id>([^<\s]+)<\/task-id>/g

type Spawn = {
  message: NativeChatMessage
  /** The prompt that opened the turn the spawn ran in; its siblings share it. */
  turnId: string | null
  resultError: boolean
  resultText: string | null
}

/** A row that opens a turn: a person's (or a subagent's brief) prompt, not a result or notice. */
function opensTurn(message: NativeChatMessage): boolean {
  return (
    message.role === 'user' &&
    message.blocks.some((block) => block.type === 'text' || block.type === 'image-ref') &&
    !isNoiseMessage(message)
  )
}

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
  // Rows of each agent (the session's own, or one subagent's) open their own turns.
  const turnOf = new Map<string, string>()
  for (const message of rows) {
    const agent = message.agentId ?? ''
    if (opensTurn(message)) {
      turnOf.set(agent, message.id)
    }
    for (const block of message.blocks) {
      if (block.type === 'tool-call' && SPAWN_TOOLS.has(block.name) && block.callId) {
        if (!spawns.has(block.callId)) {
          const turnId = turnOf.get(agent) ?? null
          spawns.set(block.callId, { message, turnId, resultError: false, resultText: null })
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

/** One spawn's roster entry, with the call that spawned it and that call's clock. */
export type ClaudeSubagentRosterEntry = {
  block: NativeChatSubagentBlock
  callId: string
  spawnedAt: number | null
}

/** Every subagent whose spawning call is loaded, in the shape the structured lane records. */
export function claudeSubagentRoster(
  messages: readonly NativeChatMessage[],
  subagents: readonly NativeChatSubagentTranscript[],
  sessionLive: boolean
): ClaudeSubagentRosterEntry[] {
  const spawns = new Map<string, Spawn>()
  indexSpawns(messages, spawns)
  for (const subagent of subagents) {
    indexSpawns(subagent.messages, spawns)
  }
  const notified = notifiedStates(messages)
  const known = new Set(subagents.map((subagent) => subagent.agentId))
  const roster: ClaudeSubagentRosterEntry[] = []
  for (const subagent of subagents) {
    const callId = subagent.toolUseId
    const spawn = callId ? spawns.get(callId) : undefined
    if (!callId || !spawn) {
      continue
    }
    const state = stateOf(subagent, spawn, notified.get(subagent.agentId), sessionLive)
    const parent =
      subagent.parentAgentId && known.has(subagent.parentAgentId) ? subagent.parentAgentId : null
    roster.push({
      callId,
      spawnedAt: spawn.message.timestamp,
      block: {
        type: 'subagent',
        id: subagent.agentId,
        label: subagent.description ?? subagent.agentType ?? 'Subagent',
        state,
        // Why the turn, as the structured lane's journal does: Claude writes each call of one
        // reply as its own transcript row, so keying by row drew every parallel spawn as its own
        // unnamed "Ran 1 subagent" roster.
        groupId: spawn.turnId ?? spawn.message.id,
        ...(parent ? { parentId: parent } : {}),
        ...(subagent.startedAt !== null ? { startedAt: subagent.startedAt } : {}),
        ...(state !== 'working' && subagent.updatedAt !== null
          ? { settledAt: subagent.updatedAt }
          : {})
      }
    })
  }
  return roster
}

/**
 * The rows less the Agent calls a roster row stands for, and their results. Why: the roster is the
 * spawn's one row, as in structured chats (it names each subagent and opens to its steps and
 * report); the calls kept beside it drew the same subagents again as a "Ran 4 agents" run. A row
 * left with nothing is dropped, so it holds no gap.
 */
function withoutRosteredSpawns(
  rows: readonly NativeChatMessage[],
  rostered: ReadonlySet<string>
): NativeChatMessage[] {
  const isRostered = (block: NativeChatBlock): boolean =>
    (block.type === 'tool-call' || block.type === 'tool-result') &&
    block.callId !== undefined &&
    rostered.has(block.callId)
  return rows.flatMap((message) => {
    if (!message.blocks.some(isRostered)) {
      return [message]
    }
    const blocks = message.blocks.filter((block) => !isRostered(block))
    return blocks.length > 0 ? [{ ...message, blocks }] : []
  })
}

/**
 * The session's rows with its subagents' rows and one roster row per spawn, in place of the spawn's
 * call. A roster row sits at its spawning call (same clock), in the spawner's own rows when a
 * subagent spawned it.
 */
export function mergeClaudeSubagents(
  messages: readonly NativeChatMessage[],
  subagents: readonly NativeChatSubagentTranscript[],
  sessionLive: boolean
): NativeChatMessage[] {
  if (subagents.length === 0) {
    return messages as NativeChatMessage[]
  }
  const roster = claudeSubagentRoster(messages, subagents, sessionLive)
  const rostered = new Set(roster.map((entry) => entry.callId))
  const rosterRows = roster.map(({ block, spawnedAt }): NativeChatMessage => ({
    id: `subagent-roster:${block.id}`,
    role: 'system',
    blocks: [{ type: 'text', text: subagentFallbackText(block) }, block],
    timestamp: spawnedAt,
    source: 'hook',
    ...(block.parentId ? { agentId: block.parentId } : {})
  }))
  return [
    ...withoutRosteredSpawns(messages, rostered),
    ...rosterRows,
    ...subagents.flatMap((subagent) => withoutRosteredSpawns(subagent.messages, rostered))
  ]
}
