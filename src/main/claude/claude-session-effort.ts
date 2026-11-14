import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { readAgentEffortLevel } from '../../shared/agent-launch/choices/agent-effort-level'
import type { ClaudeSessionEffortSettings } from '../../shared/native-chat/claude-session-effort-types'

const NONE: ClaudeSessionEffortSettings = { flag: null, byModel: {}, fallback: null }

type SessionRecord = { pid?: unknown; sessionId?: unknown }

async function findSessionProcess(
  sessionId: string,
  recordDirs: readonly string[]
): Promise<{ pid: number; configDir: string } | null> {
  for (const dir of recordDirs) {
    const names = await readdir(dir).catch(() => [] as string[])
    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue
      }
      const record = await readFile(join(dir, name), 'utf8')
        .then((text) => JSON.parse(text) as SessionRecord)
        .catch(() => null)
      if (record?.sessionId === sessionId && typeof record.pid === 'number') {
        return { pid: record.pid, configDir: dirname(dir) }
      }
    }
  }
  return null
}

function processCommand(pid: number): Promise<string> {
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'command=', '-p', String(pid)], (error, stdout) =>
      resolve(error ? '' : stdout)
    )
  })
}

export function readEffortFlag(command: string): string | null {
  const match = command.match(/(?:^|\s)--effort(?:=|\s+)(\S+)/)
  return (match && readAgentEffortLevel(match[1])) ?? null
}

/** The model a Claude process was started on by flag (`--model opus`, `--model=claude-opus-5-5`). */
export function readModelFlag(command: string): string | null {
  return command.match(/(?:^|\s)['"]?--model(?:=|['"]?\s+)['"]?([^\s'"]+)/)?.[1] ?? null
}

function readSavedModel(settings: unknown): string | null {
  const model =
    settings && typeof settings === 'object' ? (settings as Record<string, unknown>).model : null
  return typeof model === 'string' && model.trim() ? model.trim() : null
}

export function readEffortSettings(
  settings: unknown
): Pick<ClaudeSessionEffortSettings, 'byModel' | 'fallback'> {
  if (!settings || typeof settings !== 'object') {
    return { byModel: {}, fallback: null }
  }
  const { effortLevel, modelSettings } = settings as Record<string, unknown>
  const byModel: Record<string, string> = {}
  if (modelSettings && typeof modelSettings === 'object') {
    for (const [model, entry] of Object.entries(modelSettings as Record<string, unknown>)) {
      const level =
        entry && typeof entry === 'object'
          ? readAgentEffortLevel((entry as Record<string, unknown>).effortLevel)
          : undefined
      if (level) {
        byModel[model] = level
      }
    }
  }
  return { byModel, fallback: readAgentEffortLevel(effortLevel) ?? null }
}

/** Reads the effort a local Claude session started with; nothing when its process is not found. */
export async function readClaudeSessionEffortSettings(
  sessionId: string,
  recordDirs: readonly string[]
): Promise<ClaudeSessionEffortSettings> {
  if (!sessionId.trim()) {
    return NONE
  }
  const found = await findSessionProcess(sessionId, recordDirs)
  const configDir = found?.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  const [command, settings] = await Promise.all([
    found ? processCommand(found.pid) : Promise.resolve(''),
    readFile(join(configDir, 'settings.json'), 'utf8')
      .then((text) => JSON.parse(text) as unknown)
      .catch(() => null)
  ])
  return {
    flag: readEffortFlag(command),
    ...readEffortSettings(settings),
    model: readModelFlag(command) ?? readSavedModel(settings)
  }
}
