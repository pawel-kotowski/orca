import { statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  CLAUDE_INJECTED_CONFIG_DIR_ENV,
  CLAUDE_PROFILE_POINTER_ENV
} from '../../../../shared/agent-accounts/claude/claude-profile-routing'

/** What the host knows about its own Claude folder, for a resume that names a folder. */
export type ClaudeResumeFolderHost = {
  /** The host's own folder: the user's CLAUDE_CONFIG_DIR, else ~/.claude. */
  systemDefaultHome: string
  /** The user's own CLAUDE_CONFIG_DIR, when set. */
  userConfigDir: string | undefined
  /** Whether Orca routes this terminal through its `claude` shell function. */
  routed: boolean
  platform?: NodeJS.Platform
}

function sameFolder(left: string, right: string, platform: NodeJS.Platform): boolean {
  const a = resolve(left)
  const b = resolve(right)
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Makes a resumed Claude run in the config folder its session last ran in. The pane's `claude`
 * shell function keeps a CLAUDE_CONFIG_DIR that Orca did not inject (claude-shell-function.ts),
 * so another folder is set as the pane's own value. The host's own folder is reached through an
 * account pointer that always reads empty, which the function treats as System default. A folder
 * that is gone, or a WSL share, leaves the normal routing in place.
 */
export function withClaudeResumeFolder(
  env: Record<string, string>,
  folder: string,
  host: ClaudeResumeFolderHost
): Record<string, string> {
  const platform = host.platform ?? process.platform
  if (/^[\\/]{2}/.test(folder) || !isFolder(folder)) {
    return env
  }
  const next = { ...env }
  delete next[CLAUDE_INJECTED_CONFIG_DIR_ENV]
  if (!sameFolder(folder, host.systemDefaultHome, platform)) {
    next.CLAUDE_CONFIG_DIR = folder
    return next
  }
  if (host.userConfigDir) {
    next.CLAUDE_CONFIG_DIR = host.userConfigDir
  } else {
    delete next.CLAUDE_CONFIG_DIR
  }
  if (host.routed) {
    next[CLAUDE_PROFILE_POINTER_ENV] = platform === 'win32' ? 'NUL' : '/dev/null'
  }
  return next
}
