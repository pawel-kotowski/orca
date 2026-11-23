import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { processCommand } from '../../claude/claude-session-effort'

/** A live Claude process, from its own record `<CLAUDE_CONFIG_DIR>/sessions/<pid>.json`. */
export type ClaudeSessionProcess = { pid: number; configDir: string }

const ProcessRecord = z.object({
  pid: z.number(),
  sessionId: z.string(),
  kind: z.string().optional(),
  procStart: z.string().optional()
})

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM'
  }
}

/** The start time in /proc tells a reused pid (after a reboot) from the one the record names. */
async function isRecordedProcess(pid: number, procStart: string | undefined): Promise<boolean> {
  if (process.platform === 'linux' && procStart !== undefined) {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '')
    // The name is in parentheses and may hold spaces; starttime is the 20th field after it.
    return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === procStart
  }
  if (process.platform === 'win32') {
    return true
  }
  return /claude/i.test(await processCommand(pid))
}

/** The live interactive Claude running this session, whichever login's folder it runs in. */
export async function findClaudeSessionProcess(
  sessionId: string,
  recordDirs: readonly string[]
): Promise<ClaudeSessionProcess | null> {
  for (const dir of recordDirs) {
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      if (!name.endsWith('.json')) {
        continue
      }
      const record = await readFile(join(dir, name), 'utf8')
        .then((text) => ProcessRecord.parse(JSON.parse(text)))
        .catch(() => null)
      if (
        record?.sessionId === sessionId &&
        (record.kind === undefined || record.kind === 'interactive') &&
        isProcessAlive(record.pid) &&
        (await isRecordedProcess(record.pid, record.procStart))
      ) {
        return { pid: record.pid, configDir: dirname(dir) }
      }
    }
  }
  return null
}

/** A running process's exact arguments, where the platform keeps them apart (Linux). */
export async function readProcessArgv(pid: number): Promise<string[] | null> {
  if (process.platform !== 'linux') {
    return null
  }
  const raw = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')
  const argv = raw.split('\0').slice(0, -1)
  return argv.length > 0 ? argv : null
}

/** The Orca pane a process was started in, where its environment is readable (Linux). */
export async function readProcessPaneKey(pid: number): Promise<string | null> {
  if (process.platform !== 'linux') {
    return null
  }
  const raw = await readFile(`/proc/${pid}/environ`, 'utf8').catch(() => '')
  const entry = raw.split('\0').find((line) => line.startsWith('ORCA_PANE_KEY='))
  return entry?.slice('ORCA_PANE_KEY='.length) ?? null
}
