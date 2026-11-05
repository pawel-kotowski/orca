import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getAppEnvironment } from '../../../../shared/app-environment'
import type { RefusedPaneResume } from '../../../../shared/agent-status/contracts/agent-status-ipc-payload'
import type { ResumeSpawnAdmission } from './saved-resume-admission'

/** A running Claude process's own record: `<CLAUDE_CONFIG_DIR>/sessions/<pid>.json`. */
type ClaudeProcessRecord = { pid?: unknown; sessionId?: unknown }

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM: the process exists but belongs to someone else; it is still alive.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** The config dirs Claude processes on this machine may record themselves in. */
export async function claudeSessionRecordDirs(userDataDir: string | null): Promise<string[]> {
  const dirs = new Set<string>([join(homedir(), '.claude', 'sessions')])
  if (process.env.CLAUDE_CONFIG_DIR) {
    dirs.add(join(process.env.CLAUDE_CONFIG_DIR, 'sessions'))
  }
  if (userDataDir) {
    // Orca's per-account Claude homes (claude-profiles/<id>/home).
    const profiles = join(userDataDir, 'claude-profiles')
    const entries = await readdir(profiles, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.add(join(profiles, entry.name, 'home', 'sessions'))
      }
    }
  }
  return [...dirs]
}

/**
 * The pid of a live Claude process already running this conversation, if any. Why: after a restart
 * that could not reach its terminal daemon, Orca restored agent panes in fresh terminals and typed
 * `claude --resume <id>` while the original Claude still ran, so two or three processes worked the
 * same conversation (duplicate scheduled checks, duplicate messages). A resume of a conversation
 * that is still running anywhere must not start a second copy.
 */
export async function findLiveClaudeSessionHolder(
  sessionId: string,
  dirs: readonly string[]
): Promise<number | null> {
  for (const dir of dirs) {
    const names = await readdir(dir).catch(() => [] as string[])
    for (const name of names) {
      if (!name.endsWith('.json')) {
        continue
      }
      const record = await readFile(join(dir, name), 'utf8')
        .then((text) => JSON.parse(text) as ClaudeProcessRecord)
        .catch(() => null)
      if (
        record &&
        record.sessionId === sessionId &&
        typeof record.pid === 'number' &&
        record.pid !== process.pid &&
        isAlive(record.pid)
      ) {
        return record.pid
      }
    }
  }
  return null
}

function userDataDir(): string | null {
  try {
    return getAppEnvironment().getPath('userData')
  } catch {
    return null
  }
}

/** The first resume whose Claude conversation a live process already runs, if any. */
export async function firstResumeRunningElsewhere(
  resumes: readonly RefusedPaneResume[],
  recordDirs?: () => Promise<string[]>
): Promise<RefusedPaneResume | null> {
  for (const resume of resumes) {
    const { agent, providerSession } = resume
    if (agent !== 'claude' || !providerSession.id?.trim()) {
      continue
    }
    try {
      const dirs = recordDirs ? await recordDirs() : await claudeSessionRecordDirs(userDataDir())
      const holder = await findLiveClaudeSessionHolder(providerSession.id, dirs)
      if (holder !== null) {
        console.warn(
          `[pty] not resuming ${providerSession.id}: Claude pid ${holder} already runs it`
        )
        return resume
      }
    } catch {
      // An unreadable record dir must not block a restore the user expects.
    }
  }
  return null
}

/**
 * An admitted automatic resume becomes a `running-elsewhere` refusal when a live Claude process
 * already runs its conversation; any other admission passes through unchanged.
 */
export async function refuseIfRunningElsewhere(
  admission: ResumeSpawnAdmission | null,
  recordDirs?: () => Promise<string[]>
): Promise<ResumeSpawnAdmission | null> {
  if (admission?.verdict !== 'admitted') {
    return admission
  }
  const busy = await firstResumeRunningElsewhere([admission.refused], recordDirs)
  return busy ? { ...admission, verdict: 'running-elsewhere' } : admission
}
