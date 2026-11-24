import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { getAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'
import { getClaudeObservedConfigDirs } from '../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import { PS_TIMEOUT_MS } from '../../../../shared/process-observation/tables/process-table-ps-capture'
import { claudeSessionRecordDirs } from '../../../ipc/pty/host-env/live-claude-session-holder'

export type ClaudeSessionRecord = { pid: number; sessionId: string | null }

type SavedRecord = { sessionId: string | null; procStart?: unknown; startedAt?: unknown }

/**
 * Local: the conversation each Claude process of `live` runs, by its own record; null when that
 * cannot be read. A session put in the background keeps its conversation, and only its record names
 * it. A record of an earlier process with the same pid is left out.
 */
export async function readClaudeSessionRecords(
  live: (pid: number) => boolean,
  recordDirs: () => Promise<string[]> = claudeRecordDirs
): Promise<ClaudeSessionRecord[]> {
  const records: (SavedRecord & { pid: number })[] = []
  for (const dir of await recordDirs()) {
    for (const name of await readdir(dir).catch(whenNotOurs<string[]>([]))) {
      const pid = Number(/^(\d+)\.json$/.exec(name)?.[1])
      const record = pid && live(pid) ? await readRecord(join(dir, name)) : null
      if (record) {
        records.push({ pid, ...record })
      }
    }
  }
  const pids = records.map(({ pid }) => pid)
  if (process.platform === 'linux') {
    const ticks = await startTicks(pids)
    return records.filter(({ pid, procStart }) => {
      const start = ticks.get(pid)
      return start === undefined || typeof procStart !== 'string' || start === procStart
    })
  }
  const times = process.platform === 'win32' ? new Map<number, number>() : await startTimes(pids)
  return records.filter(
    // A process that started after the record's own is another, with its pid. `ps` says whole seconds.
    ({ pid, startedAt }) =>
      typeof startedAt !== 'number' || !((times.get(pid) ?? 0) > startedAt + 1000)
  )
}

async function claudeRecordDirs(): Promise<string[]> {
  const observed = (getClaudeObservedConfigDirs()?.list() ?? [])
    // A share whose read could boot a stopped WSL distro.
    .filter((dir) => !/^[\\/]{2}/.test(dir))
    .map((dir) => join(dir, 'sessions'))
  const known = await claudeSessionRecordDirs(getAppEnvironment().getPath('userData'))
  return [...new Set([...known, ...observed])]
}

/** Any other failure is the folder's own: a Claude of this user could not keep its record there. */
function whenNotOurs<T>(value: T) {
  return (error: NodeJS.ErrnoException): T => {
    if (error.code === 'EMFILE' || error.code === 'ENFILE') {
      throw error
    }
    return value
  }
}

async function readRecord(path: string): Promise<SavedRecord | null> {
  // Claude writes it in place, so a torn one is whole a moment later.
  for (const attempt of [0, 1]) {
    try {
      const { sessionId, procStart, startedAt } = JSON.parse(
        await readFile(path, 'utf8')
      ) as Record<string, unknown>
      return typeof sessionId === 'string' ? { sessionId, procStart, startedAt } : null
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      await (attempt === 0 && delay(50))
    }
  }
  return { sessionId: null }
}

/** Each process's start as Claude records it on Linux; one that cannot be told is left out. */
async function startTicks(pids: readonly number[]): Promise<Map<number, string>> {
  const starts = new Map<number, string>()
  for (const pid of pids) {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8').catch(() => '')
    // The name is in parentheses and may hold spaces; starttime is the 20th field after it.
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
    if (start) {
      starts.set(pid, start)
    }
  }
  return starts
}

/** When each process started; one that cannot be told is left out. */
async function startTimes(pids: readonly number[]): Promise<Map<number, number>> {
  if (pids.length === 0) {
    return new Map()
  }
  const { stdout } = await promisify(execFile)('ps', ['-o', 'pid=,lstart=', '-p', pids.join(',')], {
    env: { ...process.env, TZ: 'UTC', LC_ALL: 'C' },
    timeout: PS_TIMEOUT_MS
  }).catch(() => ({ stdout: '' }))
  return new Map(
    stdout.split('\n').flatMap((line): [number, number][] => {
      const [, pid, start] = /^\s*(\d+)\s+(\S.*?)\s*$/.exec(line) ?? []
      const at = Date.parse(`${start} UTC`)
      return pid && Number.isFinite(at) ? [[Number(pid), at]] : []
    })
  )
}
