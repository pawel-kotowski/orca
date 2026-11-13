import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAppEnvironment } from '../../../shared/app-environment'
import type { AgentHookServer } from '../server/agent-hook-server'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'
import {
  readIdleCompactionSessionFacts,
  type IdleCompactionAgent
} from './idle-compaction-session-facts'
import { IDLE_COMPACTION_MIN_TOKENS, IdleCompactionScheduler } from './idle-compaction-scheduler'

type IdleCompactionRuntime = Pick<
  OrcaRuntimeService,
  'getTerminalHandleForPaneKey' | 'readTerminalMailHold' | 'sendTerminalAgentPrompt'
>

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Claude's own switches turn Orca's fallback off too: `idleCompaction: false` or auto-compact off.
 *  The config folder is the transcript's (`<config>/projects/<project>/<session>.jsonl`). */
export async function claudeAllowsIdleCompaction(transcriptPath: string): Promise<boolean> {
  const marker = transcriptPath.lastIndexOf('/projects/')
  if (marker === -1) {
    return true
  }
  const configDir = transcriptPath.slice(0, marker)
  const [settings, globalConfig] = await Promise.all([
    readJson(join(configDir, 'settings.json')),
    readJson(join(configDir, '.claude.json'))
  ])
  return (
    settings?.idleCompaction !== false &&
    settings?.autoCompactEnabled !== false &&
    globalConfig?.autoCompactEnabled !== false
  )
}

function minTokensFromEnv(): number {
  const raw = Number(process.env.ORCA_IDLE_COMPACT_MIN_TOKENS)
  return Number.isFinite(raw) && raw > 0 ? raw : IDLE_COMPACTION_MIN_TOKENS
}

function decisionLog(): (line: string) => void {
  let dir: string | null = null
  try {
    dir = join(getAppEnvironment().getPath('userData'), 'logs')
  } catch {
    dir = null
  }
  return (line) => {
    console.info(`[idle-compaction] ${line}`)
    if (dir) {
      const target = dir
      void mkdir(target, { recursive: true })
        .then(() => appendFile(join(target, 'idle-compaction.log'), `${line}\n`))
        .catch(() => {})
    }
  }
}

/** Arms Orca's idle compaction on whichever host runs the hook server (Electron or orcad).
 *  `ORCA_IDLE_COMPACTION=0` turns it off; `ORCA_IDLE_COMPACT_MIN_TOKENS` moves the 200k floor. */
export function installIdleCompaction(
  server: Pick<AgentHookServer, 'subscribeEnrichedStatus'>,
  getRuntime: () => IdleCompactionRuntime | null
): () => void {
  if (process.env.ORCA_IDLE_COMPACTION === '0') {
    return () => {}
  }
  const scheduler = new IdleCompactionScheduler({
    now: Date.now,
    setTimer: (run, ms) => {
      const timer = setTimeout(run, ms)
      timer.unref?.()
      return { cancel: () => clearTimeout(timer) }
    },
    minTokens: minTokensFromEnv(),
    allowedBySettings: (agent: IdleCompactionAgent, transcriptPath: string) =>
      agent === 'claude' ? claudeAllowsIdleCompaction(transcriptPath) : Promise.resolve(true),
    readFacts: readIdleCompactionSessionFacts,
    terminalHandle: (paneKey) => getRuntime()?.getTerminalHandleForPaneKey(paneKey) ?? null,
    inputHold: (handle) => {
      const runtime = getRuntime()
      if (!runtime) {
        return 'no_runtime'
      }
      return runtime.readTerminalMailHold(handle)?.kind ?? null
    },
    sendCompact: async (handle) => {
      const runtime = getRuntime()
      if (!runtime) {
        throw new Error('no_runtime')
      }
      const sent = await runtime.sendTerminalAgentPrompt(handle, '/compact', {
        inputKind: 'driving',
        acceptQueued: true,
        observationTimeoutMs: 0,
        onPermission: 'refuse'
      })
      if (!sent.accepted) {
        throw new Error('not_accepted')
      }
    },
    log: decisionLog()
  })
  const unsubscribe = server.subscribeEnrichedStatus((event) => scheduler.onStatus(event))
  return () => {
    unsubscribe()
    scheduler.dispose()
  }
}
