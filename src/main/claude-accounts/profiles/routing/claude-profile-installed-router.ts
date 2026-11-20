import { homedir } from 'node:os'
import { join } from 'node:path'
import { CLAUDE_WORKSPACE_ACCOUNT_ENV } from '../../../../shared/claude-workspace-account'
import { CLAUDE_RESUME_CONFIG_DIR_ENV } from '../../../../shared/agent-launch/startup/claude-resume-account'
import { readUserClaudeConfigDir } from '../claude-profile-paths'
import { withClaudeResumeFolder } from './claude-resume-folder-env'
import { isDirectory } from '../claude-profile-homes'
// Keep the router setup graph out of scan workers.
import type { ClaudeProfileRouter } from './claude-profile-router'
import type { ClaudeWslProfileRouter } from '../wsl/claude-profile-wsl-router'
import type { ClaudeAccountSelectionTarget } from '../../selection/runtime-selection'
import type { ClaudeObservedConfigDirs } from './claude-observed-config-dirs'

let installed: ClaudeProfileRouter | undefined

/** Installed only in the desktop process. */
export function installClaudeProfileRouter(router: ClaudeProfileRouter | undefined): void {
  installed = router
}

export function getClaudeProfileRouter(): ClaudeProfileRouter | undefined {
  return installed
}

let installedObserved: ClaudeObservedConfigDirs | undefined

export function installClaudeObservedConfigDirs(dirs: ClaudeObservedConfigDirs | undefined): void {
  installedObserved = dirs
}

export function getClaudeObservedConfigDirs(): ClaudeObservedConfigDirs | undefined {
  return installedObserved
}

let installedWsl: ClaudeWslProfileRouter | undefined

export function installClaudeWslProfileRouter(router: ClaudeWslProfileRouter | undefined): void {
  installedWsl = router
}

export function getClaudeWslProfileRouter(): ClaudeWslProfileRouter | undefined {
  return installedWsl
}

/** Route a host spawn to its launch's or workspace's own Claude account when it has one. */
export function claudeSpawnSelectionTarget(
  target: ClaudeAccountSelectionTarget,
  spawn: { env?: Record<string, string>; worktreeId?: string }
): ClaudeAccountSelectionTarget {
  if (target.runtime === 'wsl' || !installed) {
    return target
  }
  const accountId = installed.accountForLaunch(
    spawn.env?.[CLAUDE_WORKSPACE_ACCOUNT_ENV],
    spawn.worktreeId
  )
  return accountId ? { ...target, workspaceAccountId: accountId } : target
}

export function withClaudeProfileTerminalEnv<Env extends Record<string, string> | undefined>(
  env: Env,
  target: ClaudeAccountSelectionTarget
): Env | Record<string, string> {
  // The request is routed here; the agent itself never needs it.
  const {
    [CLAUDE_WORKSPACE_ACCOUNT_ENV]: _requested,
    [CLAUDE_RESUME_CONFIG_DIR_ENV]: resumeFolder,
    ...rest
  } = env ?? {}
  void _requested
  const routedEnv =
    env && (CLAUDE_WORKSPACE_ACCOUNT_ENV in env || CLAUDE_RESUME_CONFIG_DIR_ENV in env) ? rest : env
  const profileEnv = installed?.terminalEnv(target)
  const merged = profileEnv ? { ...routedEnv, ...profileEnv } : routedEnv
  if (!resumeFolder || target.runtime === 'wsl') {
    return merged
  }
  // Why after the account's env: a resumed session runs in the folder it last ran in.
  const userConfigDir = installed ? installed.userConfigDir() : readUserClaudeConfigDir(process.env)
  return withClaudeResumeFolder(merged ?? {}, resumeFolder, {
    systemDefaultHome:
      installed?.systemDefaultHome() ?? userConfigDir ?? join(homedir(), '.claude'),
    userConfigDir,
    routed: Boolean(profileEnv)
  })
}

/** The user's CLAUDE_CONFIG_DIR from the login shell, folders Orca saw Claude use, and account homes. */
export function claudeProfileHistoryDirs(surface: 'projects' | 'transcripts'): string[] {
  const homes = [
    installed?.userConfigDir(),
    ...(installedObserved?.list() ?? []),
    ...(installed?.accountHomes() ?? [])
  ].filter((home): home is string => Boolean(home))
  const dirs = homes.map((home) => join(home, surface)).filter(isDirectory)
  return dirs.filter((dir, index) => dirs.indexOf(dir) === index)
}
