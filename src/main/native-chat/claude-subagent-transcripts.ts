// Claude Code's own subagents for terminal-backed chats (Paweł, 2026-11-10: "I need to see both
// native harness subagents and orca subagents in given chat"). Claude writes each subagent's
// transcript beside the session's: `<session>/subagents/agent-<id>.jsonl`, with
// `agent-<id>.meta.json` naming the parent's spawning tool call (`toolUseId`), its description,
// type and whether it finished. Each file is decoded with the session decoder and read on from
// where the last read stopped, so a running subagent costs only its new lines.

import { open, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { NativeChatMessage } from '../../shared/native-chat/native-chat-types'
import type { NativeChatSubagentTranscript } from '../../shared/native-chat/native-chat-subagent-transcripts'
import { decodeClaudeTranscriptLine } from './transcript-line-decoders-claude'

const AGENT_FILE = /^agent-([A-Za-z0-9_-]{1,128})\.jsonl$/
/** Rows kept per subagent: its brief and the newest work, enough to follow it. */
const MAX_ROWS_PER_AGENT = 400
const MAX_AGENTS = 64
/** One read at most this much of a file; a larger backlog keeps only its tail. */
const MAX_READ_BYTES = 8 * 1024 * 1024

type Meta = {
  toolUseId: string | null
  parentAgentId: string | null
  description: string | null
  agentType: string | null
  finished: boolean | null
}

type CachedAgent = {
  size: number
  mtimeMs: number
  offset: number
  lineIndex: number
  messages: NativeChatMessage[]
  firstAt: number | null
  lastAt: number | null
  metaMtimeMs: number
  meta: Meta
}

const cache = new Map<string, CachedAgent>()

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

async function readMeta(path: string, cached: CachedAgent | undefined): Promise<[number, Meta]> {
  try {
    const info = await stat(path)
    if (cached && cached.metaMtimeMs === info.mtimeMs) {
      return [info.mtimeMs, cached.meta]
    }
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    return [
      info.mtimeMs,
      {
        toolUseId: str(record.toolUseId),
        parentAgentId: str(record.parentAgentId),
        description: str(record.description),
        agentType: str(record.agentType),
        finished: typeof record.finished === 'boolean' ? record.finished : null
      }
    ]
  } catch {
    return [
      0,
      { toolUseId: null, parentAgentId: null, description: null, agentType: null, finished: null }
    ]
  }
}

/** A subagent row: tagged with its agent, ordered by its clock among the parent's rows. */
function asSubagentRow(
  message: NativeChatMessage,
  agentId: string,
  parentAgentId: string | null
): NativeChatMessage {
  const { transcriptOrder: _order, transcriptOffset: _offset, ...rest } = message
  // Why not 'transcript': canonical rows sort by their byte offset, and these offsets are in
  // another file. Supplemental rows are placed among the parent's by their timestamps.
  return {
    ...rest,
    id: `subagent:${agentId}:${message.id}`,
    agentId,
    ...(parentAgentId ? { parentAgentId } : {}),
    source: 'hook'
  }
}

async function readAgent(path: string, agentId: string): Promise<CachedAgent | null> {
  const info = await stat(path)
  const prior = cache.get(path)
  const metaPath = join(dirname(path), `agent-${agentId}.meta.json`)
  const [metaMtimeMs, meta] = await readMeta(metaPath, prior)
  if (prior && prior.size === info.size && prior.mtimeMs === info.mtimeMs) {
    const next = { ...prior, metaMtimeMs, meta }
    cache.set(path, next)
    return next
  }
  // A shrunk file was rewritten: start over.
  const base: CachedAgent =
    prior && info.size >= prior.offset
      ? prior
      : {
          size: 0,
          mtimeMs: 0,
          offset: 0,
          lineIndex: 0,
          messages: [],
          firstAt: null,
          lastAt: null,
          metaMtimeMs,
          meta
        }
  const start = Math.max(base.offset, info.size - MAX_READ_BYTES)
  const length = info.size - start
  // Why up to the last newline: a line still being written (or a split UTF-8 character) is read
  // whole next time.
  let text = ''
  let consumed = 0
  if (length > 0) {
    const handle = await open(path, 'r')
    try {
      const buffer = Buffer.alloc(length)
      const { bytesRead } = await handle.read(buffer, 0, length, start)
      consumed = buffer.subarray(0, bytesRead).lastIndexOf(0x0a) + 1
      text = buffer.subarray(0, consumed).toString('utf8')
    } finally {
      await handle.close()
    }
  }
  const continues = start === base.offset
  const lines = text.split('\n')
  // Why: a tail read that skipped a backlog starts mid-line.
  if (!continues && start > 0) {
    lines.shift()
  }
  const messages = continues ? base.messages.slice() : []
  let { lineIndex, firstAt, lastAt } = base
  for (const line of lines) {
    lineIndex += 1
    if (!line.trim()) {
      continue
    }
    const decoded = decodeClaudeTranscriptLine(line, `${agentId}:${lineIndex}`)
    if (!decoded) {
      continue
    }
    if (decoded.timestamp !== null) {
      firstAt ??= decoded.timestamp
      lastAt = decoded.timestamp
    }
    messages.push(asSubagentRow(decoded, agentId, meta.parentAgentId))
  }
  // Why keep the first row: it is the brief the subagent was given.
  const bounded =
    messages.length > MAX_ROWS_PER_AGENT
      ? [messages[0]!, ...messages.slice(-(MAX_ROWS_PER_AGENT - 1))]
      : messages
  const next: CachedAgent = {
    size: info.size,
    mtimeMs: info.mtimeMs,
    offset: start + consumed,
    lineIndex,
    messages: bounded,
    firstAt,
    lastAt,
    metaMtimeMs,
    meta
  }
  cache.set(path, next)
  return next
}

/** The session transcript's subagents folder, or null for a path that has none. */
export function claudeSubagentsFolder(transcriptPath: string): string | null {
  const name = basename(transcriptPath)
  if (!name.endsWith('.jsonl')) {
    return null
  }
  return join(dirname(transcriptPath), name.slice(0, -'.jsonl'.length), 'subagents')
}

/** Every subagent of a Claude session, newest activity last. Empty when it spawned none. */
export async function readClaudeSubagentTranscripts(
  transcriptPath: string
): Promise<NativeChatSubagentTranscript[]> {
  const folder = claudeSubagentsFolder(transcriptPath)
  if (!folder) {
    return []
  }
  let names: string[]
  try {
    names = await readdir(folder)
  } catch {
    return []
  }
  const files = names
    .map((name) => ({ name, match: AGENT_FILE.exec(name) }))
    .filter((entry): entry is { name: string; match: RegExpExecArray } => entry.match !== null)
  const results: NativeChatSubagentTranscript[] = []
  for (const { name, match } of files) {
    const agentId = match[1]!
    try {
      const agent = await readAgent(join(folder, name), agentId)
      if (!agent) {
        continue
      }
      results.push({
        agentId,
        toolUseId: agent.meta.toolUseId,
        parentAgentId: agent.meta.parentAgentId,
        description: agent.meta.description,
        agentType: agent.meta.agentType,
        finished: agent.meta.finished,
        startedAt: agent.firstAt,
        updatedAt: agent.lastAt,
        messages: agent.messages
      })
    } catch {
      // Why: a file removed or unreadable mid-scan is skipped, never fatal to the chat.
    }
  }
  results.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0))
  return results.slice(-MAX_AGENTS)
}
