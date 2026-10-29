import type { GlobalSettings } from './global-settings-types'

/** Names the Claude account one launch asked for; the PTY spawn routes it and never passes it on. */
export const CLAUDE_WORKSPACE_ACCOUNT_ENV = 'ORCA_CLAUDE_WORKSPACE_ACCOUNT_ID'

export type ClaudeWorkspaceAccountSettings = Partial<
  Pick<
    GlobalSettings,
    'claudeManagedAccounts' | 'claudeAccountByWorktreeId' | 'claudeAccountDefaultByRepoId'
  >
>

/** Only host accounts: a WSL login cannot run a host workspace's agents. */
export function isHostClaudeAccount(
  settings: ClaudeWorkspaceAccountSettings,
  accountId: string | null | undefined
): accountId is string {
  return Boolean(
    accountId &&
    settings.claudeManagedAccounts?.some(
      (account) => account.id === accountId && account.managedAuthRuntime !== 'wsl'
    )
  )
}

/** A removed account falls back to the global selection instead of a missing folder. */
export function workspaceClaudeAccountId(
  settings: ClaudeWorkspaceAccountSettings,
  worktreeId: string | null | undefined
): string | null {
  const accountId = worktreeId ? settings.claudeAccountByWorktreeId?.[worktreeId] : undefined
  return isHostClaudeAccount(settings, accountId) ? accountId : null
}

/** The account one launch asked for, else its workspace's own; null follows the global selection. */
export function launchClaudeAccountId(
  settings: ClaudeWorkspaceAccountSettings,
  requested: string | null | undefined,
  worktreeId: string | null | undefined
): string | null {
  return isHostClaudeAccount(settings, requested)
    ? requested
    : workspaceClaudeAccountId(settings, worktreeId)
}

export function projectDefaultClaudeAccountId(
  settings: ClaudeWorkspaceAccountSettings,
  repoId: string | null | undefined
): string | null {
  const accountId = repoId ? settings.claudeAccountDefaultByRepoId?.[repoId] : undefined
  return isHostClaudeAccount(settings, accountId) ? accountId : null
}

/** Settings records are replaced whole, so every write builds the next copy. */
export function withClaudeAccountEntry(
  record: Readonly<Record<string, string>> | undefined,
  key: string,
  accountId: string | null
): Record<string, string> {
  const next = { ...record }
  if (accountId) {
    next[key] = accountId
  } else {
    delete next[key]
  }
  return next
}
