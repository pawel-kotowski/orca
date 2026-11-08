import { CLAUDE_WORKSPACE_ACCOUNT_ENV } from '../../claude-workspace-account'
import type { AgentProviderSessionMetadata } from '../../agent-session/lifecycle/agent-session-resume'

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
 * account falls back as before, and remote launches are left alone.
 */
export function claudeResumeAccountEnv(args: {
  agent: string
  providerSession: Pick<AgentProviderSessionMetadata, 'transcriptPath'>
  isRemote?: boolean
}): Record<string, string> | null {
  if (args.agent !== 'claude' || args.isRemote) {
    return null
  }
  const accountId = claudeSessionAccountId(args.providerSession)
  return accountId ? { [CLAUDE_WORKSPACE_ACCOUNT_ENV]: accountId } : null
}
