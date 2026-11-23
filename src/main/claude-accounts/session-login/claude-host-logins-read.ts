import { readdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  claudeConfigDirFromTranscriptPath,
  managedClaudeAccountIdForConfigDir
} from '../../../shared/agent-accounts/claude/claude-session-login'
import type { ClaudeHostLogin } from '../../../shared/agent-accounts/claude/claude-host-logins'
import {
  claudeStateFileAsync,
  isSameClaudeLogin,
  readClaudeFolderLoginAsync,
  type ClaudeFolderLogin
} from '../sign-in/claude-account-folder'
import {
  getClaudeObservedConfigDirs,
  getClaudeProfileRouter
} from '../profiles/routing/claude-profile-installed-router'
import { readUserClaudeConfigDir } from '../profiles/claude-profile-paths'
import type { ClaudeSessionLoginRow } from './claude-session-login-read'

export type ClaudeHostLoginRow = ClaudeSessionLoginRow & { connectionId?: string | null }

/** Where `claude-extra-login` keeps a box's logins beside `~/.claude`. */
const EXTRA_LOGINS_FOLDER = '.claude-logins'

/** The host's own Claude folder: the user's CLAUDE_CONFIG_DIR, else ~/.claude. */
export function systemClaudeFolder(userHome: string): {
  dir: string
  userConfigDir: string | undefined
} {
  const router = getClaudeProfileRouter()
  const userConfigDir = router ? router.userConfigDir() : readUserClaudeConfigDir(process.env)
  return { dir: userConfigDir ?? join(userHome, '.claude'), userConfigDir }
}

/** The CLAUDE_CONFIG_DIR that runs this folder's login; undefined for the system login's `~/.claude`. */
export function claudeConfigDirEnv(configDir: string, userHome = homedir()): string | undefined {
  const system = systemClaudeFolder(userHome)
  return resolve(configDir) === resolve(system.dir) ? system.userConfigDir : configDir
}

export async function extraClaudeLoginFolders(userHome = homedir()): Promise<string[]> {
  const root = join(userHome, EXTRA_LOGINS_FOLDER)
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => join(root, entry.name))
    .sort()
}

/**
 * Every login this host can run Claude on: its own `~/.claude`, the accounts Orca manages, the
 * folders beside it (`~/.claude-logins/*`), and any other folder its sessions have run in. A
 * folder nobody is signed in to is left out, and one login in two folders is listed once, by the
 * folder `preferred` names, else the first.
 */
export async function readClaudeHostLogins(
  deps: { rows: () => readonly ClaudeHostLoginRow[]; userHome?: string },
  preferred?: string | null
): Promise<ClaudeHostLogin[]> {
  const userHome = deps.userHome ?? homedir()
  const system = systemClaudeFolder(userHome)
  const candidates = [
    ...(preferred ? [preferred] : []),
    system.dir,
    ...(getClaudeProfileRouter()?.accountHomes() ?? []),
    ...(await extraClaudeLoginFolders(userHome)),
    ...(getClaudeObservedConfigDirs()?.list() ?? []),
    ...deps
      .rows()
      // A row relayed from an SSH host names that host's folders.
      .filter((row) => !row.connectionId)
      .flatMap(
        (row) =>
          claudeConfigDirFromTranscriptPath(row.providerSession?.transcriptPath ?? null) ?? []
      )
  ]
  const seen = new Set<string>()
  const logins: ClaudeHostLogin[] = []
  const signedIn: ClaudeFolderLogin[] = []
  for (const configDir of candidates) {
    // A WSL/UNC share whose read could boot a stopped distro, or an SSH host's folder.
    if (
      /^[\\/]{2}/.test(configDir) ||
      resolve(configDir) !== configDir.replace(/(.)[\\/]+$/, '$1')
    ) {
      continue
    }
    const real = await realpath(configDir).catch(() => null)
    if (!real || seen.has(real)) {
      continue
    }
    seen.add(real)
    const stateDir = claudeConfigDirEnv(configDir, userHome)
    const login = await readClaudeFolderLoginAsync(await claudeStateFileAsync(stateDir, userHome))
    if (!login || signedIn.some((other) => isSameClaudeLogin(other, login))) {
      continue
    }
    signedIn.push(login)
    logins.push({
      configDir,
      accountId: managedClaudeAccountIdForConfigDir(configDir),
      email: login.email,
      organizationName: login.organizationName
    })
  }
  // The system login first, then as found: the preferred folder only decides which spelling stays.
  return logins.sort(
    (left, right) =>
      Number(resolve(right.configDir) === resolve(system.dir)) -
      Number(resolve(left.configDir) === resolve(system.dir))
  )
}
