import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { getAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'
import { getClaudeObservedConfigDirs } from '../../../claude-accounts/profiles/routing/claude-profile-installed-router'
import { claudeSessionRecordDirs } from '../../../ipc/pty/host-env/live-claude-session-holder'

export type ClaudeSessionRecord = { pid: number; sessionId: string | null }

/**
 * Local: the conversation each recorded Claude process runs, by pid; null when its record cannot be
 * read. A session put in the background keeps its conversation, and only its record names it. A
 * record whose process is gone, its pid reused or not, is left out.
 */
export async function readClaudeSessionRecords(
  recordDirs: () => Promise<string[]> = claudeRecordDirs
): Promise<ClaudeSessionRecord[]> {
  const records: (ClaudeSessionRecord & { procStart?: unknown; startedAt?: unknown })[] = []
  for (const dir of await recordDirs()) {
    for (const name of await readdir(dir).catch(whenMissing<string[]>([]))) {
      const pid = Number(/^(\d+)\.json$/.exec(name)?.[1])
      const text = pid ? await readFile(join(dir, name), 'utf8').catch(whenMissing(null)) : null
      if (text === null) {
        continue
      }
      try {
        const record = JSON.parse(text) as Record<string, unknown>
        const { sessionId, procStart, startedAt } = record
        if (typeof sessionId === 'string') {
          records.push({ pid, sessionId, procStart, startedAt })
        }
      } catch {
        records.push({ pid, sessionId: null })
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

/** Only an absent file says there is nothing in it. */
function whenMissing<T>(value: T) {
  return (error: NodeJS.ErrnoException): T => {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      return value
    }
    throw error
  }
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
    env: { ...process.env, TZ: 'UTC', LC_ALL: 'C' }
  }).catch(() => ({ stdout: '' }))
  return new Map(
    stdout.split('\n').flatMap((line): [number, number][] => {
      const [, pid, start] = /^\s*(\d+)\s+(\S.*?)\s*$/.exec(line) ?? []
      const at = Date.parse(`${start} UTC`)
      return pid && Number.isFinite(at) ? [[Number(pid), at]] : []
    })
  )
}
