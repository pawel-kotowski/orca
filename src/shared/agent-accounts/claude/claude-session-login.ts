import type { ProviderRateLimits } from '../../agent-usage/rate-limits/rate-limit-types'

/**
 * The Claude login a running session really uses, read on the host from the session's own config
 * folder. Paweł, 2026-11-20: chats showed robotec while a box's limit-move had restarted their
 * Claude on personal (`CLAUDE_CONFIG_DIR=~/.claude-logins/personal`), a folder Orca never made.
 */
export type ClaudeSessionLogin = {
  /** The session's CLAUDE_CONFIG_DIR, as Claude spelled it in its transcript path. */
  configDir: string
  /** The Orca-managed account whose home this folder is; null for any other folder. */
  accountId: string | null
  /** The folder's signed-in login (its `.claude.json` `oauthAccount`); null when signed out. */
  email: string | null
  organizationName: string | null
  /** That login's usage; null for a managed account, whose usage Orca's account list carries. */
  limits: ProviderRateLimits | null
}

export type ClaudeSessionLoginArgs = { transcriptPath: string }

/**
 * The config folder a Claude transcript lives under. Claude writes `<CLAUDE_CONFIG_DIR>/projects/
 * <project>/<session>.jsonl` with the folder as it was given, links unresolved, so a session
 * restarted under another folder names that folder at its next hook, same session id or not.
 */
export function claudeConfigDirFromTranscriptPath(transcriptPath: string | null): string | null {
  if (!transcriptPath) {
    return null
  }
  const slashed = transcriptPath.replace(/\\/g, '/')
  const index = slashed.lastIndexOf('/projects/')
  return index > 0 ? transcriptPath.slice(0, index) : null
}

const MANAGED_PROFILE_HOME =
  /[\\/]claude-profiles[\\/]([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[\\/]home$/i

/** The Orca-managed account a config folder belongs to (`claude-profiles/<id>/home`), or null. */
export function managedClaudeAccountIdForConfigDir(configDir: string | null): string | null {
  const trimmed = configDir?.replace(/[\\/]+$/, '') ?? ''
  return MANAGED_PROFILE_HOME.exec(trimmed)?.[1]?.toLowerCase() ?? null
}
