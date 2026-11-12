import { open, readdir, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { claudeConfigDirForTranscript } from './claude-model-catalog-context-windows'
import { CLAUDE_PRINT_MODE_ENTRYPOINT } from '../../shared/agent-launch/startup/claude-chat-entrypoint'
import type { ClaudeProjectSession } from '../../shared/native-chat/claude-project-session-types'

export type { ClaudeProjectSession }

const HEAD_BYTES = 192 * 1024
const TAIL_BYTES = 64 * 1024
const DEFAULT_LIMIT = 60

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The text a person typed, or null for harness lines (commands, reminders, tool results). */
function promptText(content: unknown): string | null {
  const text =
    typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content
            .filter(isRecord)
            .filter((part) => part.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text as string)
            .join(' ')
        : ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat || flat.startsWith('<') || flat.startsWith('Caveat:')) {
    return null
  }
  return flat.length > 240 ? `${flat.slice(0, 239)}…` : flat
}

type Scan = {
  firstPrompt: string | null
  customTitle: string | null
  aiTitle: string | null
  summary: string | null
  entrypoint: string | null
}

function scanLines(text: string, scan: Scan, fromStart: boolean): void {
  const lines = text.split('\n')
  // A window cut mid-line keeps only whole lines.
  const whole = fromStart ? lines.slice(0, -1) : lines.slice(1)
  for (const line of whole) {
    if (!line.includes('"type"')) {
      continue
    }
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(row)) {
      continue
    }
    if (scan.entrypoint === null && typeof row.entrypoint === 'string') {
      scan.entrypoint = row.entrypoint
    }
    if (row.type === 'custom-title' && typeof row.customTitle === 'string') {
      scan.customTitle = row.customTitle
    } else if (row.type === 'ai-title' && typeof row.aiTitle === 'string') {
      scan.aiTitle = row.aiTitle
    } else if (row.type === 'summary' && typeof row.summary === 'string') {
      scan.summary = row.summary
    } else if (
      scan.firstPrompt === null &&
      row.type === 'user' &&
      row.isMeta !== true &&
      row.isSidechain !== true &&
      isRecord(row.message)
    ) {
      scan.firstPrompt = promptText(row.message.content)
    }
  }
}

async function readSession(
  path: string,
  size: number,
  mtimeMs: number
): Promise<ClaudeProjectSession | null> {
  const handle = await open(path, 'r')
  try {
    const scan: Scan = {
      firstPrompt: null,
      customTitle: null,
      aiTitle: null,
      summary: null,
      entrypoint: null
    }
    const headLength = Math.min(size, HEAD_BYTES)
    const head = Buffer.alloc(headLength)
    await handle.read(head, 0, headLength, 0)
    scanLines(head.toString('utf8') + (size <= HEAD_BYTES ? '\n' : ''), scan, true)
    if (size > HEAD_BYTES) {
      const tailLength = Math.min(size - HEAD_BYTES, TAIL_BYTES)
      const tail = Buffer.alloc(tailLength)
      await handle.read(tail, 0, tailLength, size - tailLength)
      scanLines(tail.toString('utf8'), scan, false)
    }
    // Why: Claude Code's own list leaves out conversations nobody typed in and ones a script ran
    // (`claude -p`, entrypoint sdk-cli); `/resume <id>` cannot open those either.
    if (scan.firstPrompt === null || scan.entrypoint === CLAUDE_PRINT_MODE_ENTRYPOINT) {
      return null
    }
    return {
      sessionId: basename(path, '.jsonl'),
      title: scan.customTitle ?? scan.aiTitle ?? scan.summary,
      firstPrompt: scan.firstPrompt,
      updatedAt: mtimeMs
    }
  } finally {
    await handle.close()
  }
}

/**
 * The conversations in the same project folder as `transcriptPath`, newest first: what Claude
 * Code's /resume lists for that project (Paweł, 2026-11-09: "cant you just show simple list like
 * claude code in terminal shows?"). Only a path inside a Claude home's `projects` folder is read.
 */
export async function listClaudeProjectSessions(
  transcriptPath: string,
  limit = DEFAULT_LIMIT
): Promise<ClaudeProjectSession[]> {
  if (claudeConfigDirForTranscript(transcriptPath) === null) {
    return []
  }
  const folder = dirname(transcriptPath)
  const names = (await readdir(folder).catch(() => [] as string[])).filter((name) =>
    name.endsWith('.jsonl')
  )
  const stats = await Promise.all(
    names.map(async (name) => {
      const path = join(folder, name)
      const info = await stat(path).catch(() => null)
      return info?.isFile() ? { path, size: info.size, mtimeMs: info.mtimeMs } : null
    })
  )
  const newest = stats
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null && entry.size > 0)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  const sessions: ClaudeProjectSession[] = []
  for (const entry of newest) {
    if (sessions.length >= limit) {
      break
    }
    const session = await readSession(entry.path, entry.size, entry.mtimeMs).catch(() => null)
    if (session) {
      sessions.push(session)
    }
  }
  return sessions
}
