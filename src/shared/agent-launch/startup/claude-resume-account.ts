import { CLAUDE_WORKSPACE_ACCOUNT_ENV } from '../../claude-workspace-account'
import type { AgentProviderSessionMetadata } from '../../agent-session/lifecycle/agent-session-resume'
import { claudeConfigDirFromTranscriptPath } from '../../agent-accounts/claude/claude-session-login'

/**
 * The config folder a resumed Claude session must run in when it is not an Orca-managed account:
 * the host's own folder, or one a box's limit-move or the Slack bot restarted it into
 * (`~/.claude-logins/<name>`). The host's PTY routing applies it (`withClaudeProfileTerminalEnv`).
 */
export const CLAUDE_RESUME_CONFIG_DIR_ENV = 'ORCA_CLAUDE_RESUME_CONFIG_DIR'

// Why: Claude reports transcript_path under its own CLAUDE_CONFIG_DIR, so a session run on an
// Orca-managed account names `<orca data>/claude-profiles/<account id>/home/projects/…` even
// though every profile's projects folder links to the same ~/.claude/projects.
const MANAGED_PROFILE_HOME = /[\\/]claude-profiles[\\/]([^\\/]+)[\\/]home[\\/]/

/** The Orca-managed Claude account a saved session ran on, read from its transcript path. */
export function claudeSessionAccountId(
  providerSession: Pick<AgentProviderSessionMetadata, 'transcriptPath'>
): string | null {
  return providerSession.transcriptPath?.match(MANAGED_PROFILE_HOME)?.[1] ?? null
}

/**
 * Pins a resumed Claude session to the account it ran on, ahead of the workspace's own account
 * and the global selection; the PTY spawn validates the id and strips the variable. A removed
 * account falls back as before. A session in any other folder resumes in that folder (Paweł,
 * 2026-11-20: a session limit-move had moved to personal went back to the workspace's account
 * after an Orca restart). Managed account ids are this machine's, so remote launches get only
 * the folder, which their host checks.
 */
export function claudeResumeAccountEnv(args: {
  agent: string
  providerSession: Pick<AgentProviderSessionMetadata, 'transcriptPath'>
  isRemote?: boolean
}): Record<string, string> | null {
  if (args.agent !== 'claude') {
    return null
  }
  const accountId = claudeSessionAccountId(args.providerSession)
  if (accountId) {
    return args.isRemote ? null : { [CLAUDE_WORKSPACE_ACCOUNT_ENV]: accountId }
  }
  const configDir = claudeConfigDirFromTranscriptPath(args.providerSession.transcriptPath ?? null)
  return configDir ? { [CLAUDE_RESUME_CONFIG_DIR_ENV]: configDir } : null
}
