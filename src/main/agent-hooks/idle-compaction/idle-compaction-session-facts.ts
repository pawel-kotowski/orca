import { open } from 'node:fs/promises'

/** Agents whose session file says how full the context is, and which read `/compact`. */
export type IdleCompactionAgent = 'claude' | 'codex' | 'omp' | 'pi'

export function isIdleCompactionAgent(agent: string | undefined): agent is IdleCompactionAgent {
  return agent === 'claude' || agent === 'codex' || agent === 'omp' || agent === 'pi'
}

/** What an agent's session file says about its context since a turn ended. */
export type IdleCompactionSessionFacts = {
  /** Tokens the next request would send; null when the tail holds no usage. */
  contextTokens: number | null
  /** A compaction was written at or after `since` (the agent's own, or an earlier one of ours). */
  compactedSince: boolean
  /** Claude only: the prompt cache lifetime of the newest request that wrote cache. */
  cacheTtl?: '1h' | '5m'
}

type JsonRecord = Record<string, unknown>

const TAIL_BYTES = 4 * 1024 * 1024

function record(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function timeOf(row: JsonRecord): number {
  const raw = row.timestamp
  if (typeof raw === 'number') {
    return raw
  }
  const parsed = typeof raw === 'string' ? Date.parse(raw) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

/** The file's last bytes as whole JSON rows, newest first. A row cut by the window is dropped. */
export async function readSessionTailRows(path: string, bytes = TAIL_BYTES): Promise<JsonRecord[]> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - bytes)
    const buffer = Buffer.alloc(size - start)
    await handle.read(buffer, 0, buffer.length, start)
    const lines = buffer.toString('utf8').split('\n')
    if (start > 0) {
      lines.shift()
    }
    const rows: JsonRecord[] = []
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index]!.trim()
      if (!line) {
        continue
      }
      try {
        const row = record(JSON.parse(line))
        if (row) {
          rows.push(row)
        }
      } catch {
        // A row still being written; the next read sees it whole.
      }
    }
    return rows
  } finally {
    await handle.close()
  }
}

/** Claude Code transcript: the newest main-thread reply's usage is the context; a compact boundary
 *  newer than it means the context is already small. */
export function claudeSessionFacts(rows: JsonRecord[], since: number): IdleCompactionSessionFacts {
  let contextTokens: number | null = null
  let compactedSince = false
  let cacheTtl: '1h' | '5m' | undefined
  for (const row of rows) {
    if (row.isSidechain === true) {
      continue
    }
    if (row.type === 'system' && row.subtype === 'compact_boundary') {
      if (timeOf(row) >= since) {
        compactedSince = true
      }
      if (contextTokens === null) {
        contextTokens = num(record(row.compactMetadata)?.postTokens)
      }
      continue
    }
    const usage = row.type === 'assistant' ? record(record(row.message)?.usage) : null
    if (!usage) {
      continue
    }
    if (contextTokens === null) {
      contextTokens =
        num(usage.input_tokens) +
        num(usage.cache_read_input_tokens) +
        num(usage.cache_creation_input_tokens)
    }
    const creation = record(usage.cache_creation)
    if (cacheTtl === undefined && creation) {
      cacheTtl =
        num(creation.ephemeral_1h_input_tokens) > 0
          ? '1h'
          : num(creation.ephemeral_5m_input_tokens) > 0
            ? '5m'
            : undefined
    }
    if (cacheTtl !== undefined) {
      break
    }
  }
  return { contextTokens, compactedSince, ...(cacheTtl ? { cacheTtl } : {}) }
}

/** Codex rollout: the newest `token_count` event's last request input (cached tokens included). */
export function codexSessionFacts(rows: JsonRecord[], since: number): IdleCompactionSessionFacts {
  let contextTokens: number | null = null
  let compactedSince = false
  for (const row of rows) {
    const payload = record(row.payload)
    const compaction =
      (row.type === 'response_item' && payload?.type === 'compaction') ||
      (row.type === 'event_msg' && payload?.type === 'context_compacted') ||
      row.type === 'compacted'
    if (compaction) {
      compactedSince ||= timeOf(row) >= since
      contextTokens ??= 0
      continue
    }
    if (row.type === 'event_msg' && payload?.type === 'token_count') {
      const last = record(record(payload.info)?.last_token_usage)
      if (last && contextTokens === null) {
        contextTokens = num(last.input_tokens)
      }
    }
    if (contextTokens !== null && !compactedSince && timeOf(row) < since) {
      break
    }
  }
  return { contextTokens, compactedSince }
}

/** pi / oh-my-pi session: the newest assistant message's usage (input plus cache). */
export function piSessionFacts(rows: JsonRecord[], since: number): IdleCompactionSessionFacts {
  let contextTokens: number | null = null
  let compactedSince = false
  for (const row of rows) {
    if (row.type === 'compaction') {
      compactedSince ||= timeOf(row) >= since
      contextTokens ??= 0
      continue
    }
    const usage = row.type === 'message' ? record(record(row.message)?.usage) : null
    if (usage && contextTokens === null) {
      contextTokens = num(usage.input) + num(usage.cacheRead) + num(usage.cacheWrite)
    }
    if (contextTokens !== null && !compactedSince && timeOf(row) < since) {
      break
    }
  }
  return { contextTokens, compactedSince }
}

export async function readIdleCompactionSessionFacts(
  agent: IdleCompactionAgent,
  path: string,
  since: number
): Promise<IdleCompactionSessionFacts> {
  const rows = await readSessionTailRows(path)
  switch (agent) {
    case 'claude':
      return claudeSessionFacts(rows, since)
    case 'codex':
      return codexSessionFacts(rows, since)
    case 'omp':
    case 'pi':
      return piSessionFacts(rows, since)
  }
}
