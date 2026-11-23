import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import {
  claudeConfigDirFromTranscriptPath,
  managedClaudeAccountIdForConfigDir,
  type ClaudeSessionLogin
} from '../../../shared/agent-accounts/claude/claude-session-login'
import { claudeStateFileAsync, readClaudeFolderLoginAsync } from '../sign-in/claude-account-folder'
import { systemClaudeFolder } from './claude-host-logins-read'
import { fetchActiveClaudeRateLimits } from '../../rate-limits/providers/claude/claude-active-usage-fetch'
import type { ClaudeRuntimeAuthPreparation } from '../runtime-auth/runtime-auth-types'
import { parseSshTranscriptPath } from '../../native-chat/transcript-filesystem/ssh-transcript-path'
import {
  hasUsageWindows,
  withoutResetWindows
} from '../../rate-limits/service/service-result-policy'
import {
  LONG_STALE_THRESHOLD_MS,
  STALE_THRESHOLD_MS
} from '../../rate-limits/service/service-types'

/** The hook rows that attest which config folders this host's Claude sessions really run in. */
export type ClaudeSessionLoginRow = { providerSession?: { transcriptPath?: string } | null }

export type ClaudeSessionLoginDeps = {
  rows: () => readonly ClaudeSessionLoginRow[]
  fetchUsage?: (authPreparation: ClaudeRuntimeAuthPreparation) => Promise<ProviderRateLimits>
  now?: () => number
  userHome?: string
}

/** Polling interval for a folder's usage, the desktop's own usage cadence. */
export const CLAUDE_SESSION_USAGE_REFRESH_MS = 5 * 60 * 1000

type UsageEntry = {
  limits: ProviderRateLimits | null
  fetchedAt: number
  pending: Promise<ProviderRateLimits | null> | null
}
const usageByFolder = new Map<string, UsageEntry>()

export function resetClaudeSessionLoginCacheForTests(): void {
  usageByFolder.clear()
}

function normalizeFolder(folder: string): string {
  const resolved = resolve(folder)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * The login of the Claude session whose transcript this is, read from that session's own config
 * folder, whichever process made it: an Orca-managed profile, the host's own `~/.claude`, or a
 * folder like `~/.claude-logins/personal` that a box's limit-move restarts sessions into.
 * A folder no hook row of this host names is refused, so a client cannot read arbitrary folders.
 */
export async function readClaudeSessionLogin(
  args: unknown,
  deps: ClaudeSessionLoginDeps
): Promise<ClaudeSessionLogin | null> {
  const transcriptPath =
    args && typeof args === 'object' && 'transcriptPath' in args
      ? (args as { transcriptPath: unknown }).transcriptPath
      : null
  if (typeof transcriptPath !== 'string' || parseSshTranscriptPath(transcriptPath)) {
    // An SSH workspace's transcript lives on that host; its folder cannot be read here.
    return null
  }
  const configDir = claudeConfigDirFromTranscriptPath(transcriptPath)
  if (!configDir || /^[\\/]{2}/.test(configDir)) {
    // No folder, or a WSL/UNC share whose read could boot a stopped distro.
    return null
  }
  const folder = normalizeFolder(configDir)
  const attested = deps.rows().some((row) => {
    const dir = claudeConfigDirFromTranscriptPath(row.providerSession?.transcriptPath ?? null)
    return dir !== null && !/^[\\/]{2}/.test(dir) && normalizeFolder(dir) === folder
  })
  if (!attested) {
    return null
  }
  const userHome = deps.userHome ?? homedir()
  const system = systemClaudeFolder(userHome)
  const isSystemDefault = normalizeFolder(system.dir) === folder
  // Why: Claude keeps the system login's state in ~/.claude.json, beside the folder, unless the
  // user set CLAUDE_CONFIG_DIR; any folder given as CLAUDE_CONFIG_DIR keeps it inside.
  const stateDir = isSystemDefault ? system.userConfigDir : configDir
  const login = await readClaudeFolderLoginAsync(await claudeStateFileAsync(stateDir, userHome))
  const accountId = managedClaudeAccountIdForConfigDir(configDir)
  const limits =
    accountId || !login
      ? null
      : await folderUsage(folder, deps, {
          configDir,
          envPatch: isSystemDefault ? {} : { CLAUDE_CONFIG_DIR: configDir },
          provenance: isSystemDefault ? 'system' : 'session-folder'
        })
  return {
    configDir,
    accountId,
    email: login?.email ?? null,
    organizationName: login?.organizationName ?? null,
    limits
  }
}

async function folderUsage(
  folder: string,
  deps: ClaudeSessionLoginDeps,
  authPreparation: ClaudeRuntimeAuthPreparation
): Promise<ProviderRateLimits | null> {
  const now = deps.now ?? Date.now
  const entry = usageByFolder.get(folder)
  if (entry?.pending) {
    return entry.pending
  }
  const retryAt = entry?.limits?.usageMetadata?.retryAtMs
  if (
    entry &&
    (now() - entry.fetchedAt < CLAUDE_SESSION_USAGE_REFRESH_MS ||
      (typeof retryAt === 'number' && retryAt > now()))
  ) {
    return entry.limits
  }
  const fetchUsage =
    deps.fetchUsage ??
    ((prep: ClaudeRuntimeAuthPreparation) => fetchActiveClaudeRateLimits({ authPreparation: prep }))
  const pending = fetchUsage(authPreparation)
    .then((fresh) => keepRecentUsage(fresh, entry?.limits ?? null, now()))
    .catch(() => entry?.limits ?? null)
  usageByFolder.set(folder, {
    limits: entry?.limits ?? null,
    fetchedAt: entry?.fetchedAt ?? Number.NEGATIVE_INFINITY,
    pending
  })
  const limits = await pending
  usageByFolder.set(folder, { limits, fetchedAt: now(), pending: null })
  return limits
}

/** A failed read keeps the last good windows until they reset or go stale, as the status bar does. */
export function keepRecentUsage(
  fresh: ProviderRateLimits,
  previous: ProviderRateLimits | null,
  now: number
): ProviderRateLimits {
  if (fresh.status !== 'error' || !previous || !hasUsageWindows(previous)) {
    return fresh
  }
  const staleAfter =
    fresh.usageMetadata?.failureKind === 'rate-limited' ||
    fresh.usageMetadata?.failureKind === 'stale-token'
      ? LONG_STALE_THRESHOLD_MS
      : STALE_THRESHOLD_MS
  if (now - previous.updatedAt > staleAfter) {
    return fresh
  }
  const current = withoutResetWindows(previous, now)
  return hasUsageWindows(current)
    ? {
        ...current,
        status: 'error',
        error: fresh.error,
        usageMetadata: { ...previous.usageMetadata, ...fresh.usageMetadata }
      }
    : fresh
}
