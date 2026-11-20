import { useEffect, useSyncExternalStore } from 'react'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import {
  claudeConfigDirFromTranscriptPath,
  type ClaudeSessionLogin
} from '../../../../shared/agent-accounts/claude/claude-session-login'

/**
 * The Claude login a chat's session runs on now, asked of the host that runs it (it owns the
 * hooks and the folders). Keyed by host and config folder, so every chat on one login shares one
 * read, and a session restarted under another folder (a box's limit-move, `claude-as`, a hand
 * restart) is asked about as soon as its next hook names the new folder.
 */
export type ClaudeSessionLoginState =
  | { status: 'loading' }
  | { status: 'ready'; login: ClaudeSessionLogin | null }
  /** The host could not answer (an older build without the method, or unreachable). */
  | { status: 'failed' }

type Entry = { state: ClaudeSessionLoginState; fetchedAt: number; inFlight: boolean }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
/** How often a folder's login and limits are asked again; the host reads usage at this cadence. */
export const CLAUDE_SESSION_LOGIN_REFRESH_MS = 5 * 60 * 1000
const TIMEOUT_MS = 30_000
const LOADING: ClaudeSessionLoginState = { status: 'loading' }

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** `host` is 'local' or a paired host's environment id. */
function entryKey(host: string, configDir: string): string {
  return `${host}\u0000${configDir}`
}

async function readLogin(host: string, transcriptPath: string): Promise<ClaudeSessionLogin | null> {
  if (host === 'local') {
    const read = window.api.nativeChat.readClaudeSessionLogin
    if (!read) {
      throw new Error('session login read unavailable')
    }
    return read({ transcriptPath })
  }
  return callRuntimeRpc<ClaudeSessionLogin | null>(
    { kind: 'environment', environmentId: host },
    'nativeChat.claudeSessionLogin',
    { transcriptPath },
    { timeoutMs: TIMEOUT_MS }
  )
}

async function refresh(host: string, configDir: string, transcriptPath: string): Promise<void> {
  const key = entryKey(host, configDir)
  const previous = entries.get(key)
  entries.set(key, {
    state: previous?.state ?? LOADING,
    fetchedAt: previous?.fetchedAt ?? Number.NEGATIVE_INFINITY,
    inFlight: true
  })
  let state: ClaudeSessionLoginState
  try {
    state = { status: 'ready', login: await readLogin(host, transcriptPath) }
  } catch {
    // Why keep a good answer: a host that answered before and drops one read is still on it.
    state = previous?.state.status === 'ready' ? previous.state : { status: 'failed' }
  }
  entries.set(key, { state, fetchedAt: window.performance.now(), inFlight: false })
  notify()
}

/** The login of the session whose transcript this is; null when nothing is to be asked. */
export function useClaudeSessionLogin(
  transcriptPath: string | null,
  host: string | null
): ClaudeSessionLoginState | null {
  const configDir = claudeConfigDirFromTranscriptPath(transcriptPath)
  const key = host && configDir ? entryKey(host, configDir) : null
  const state = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (key ? (entries.get(key)?.state ?? LOADING) : null)
  )
  useEffect(() => {
    if (!key || !host || !configDir || !transcriptPath) {
      return
    }
    const check = (): void => {
      const entry = entries.get(key)
      if (
        entry?.inFlight ||
        (entry && window.performance.now() - entry.fetchedAt < CLAUDE_SESSION_LOGIN_REFRESH_MS)
      ) {
        return
      }
      void refresh(host, configDir, transcriptPath)
    }
    check()
    const timer = window.setInterval(check, CLAUDE_SESSION_LOGIN_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [key, host, configDir, transcriptPath])
  return state
}

export function resetClaudeSessionLoginsForTests(): void {
  entries.clear()
  notify()
}
