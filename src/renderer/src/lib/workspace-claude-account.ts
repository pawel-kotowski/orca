import { useAppStore } from '@/store'
import { withClaudeAccountEntry } from '../../../shared/claude-workspace-account'

/** Save before the workspace's terminals or chat start, so they all launch on this account. */
export async function saveWorkspaceClaudeAccount(
  worktreeId: string,
  accountId: string
): Promise<void> {
  const { settings, updateSettings } = useAppStore.getState()
  try {
    await updateSettings({
      claudeAccountByWorktreeId: withClaudeAccountEntry(
        settings?.claudeAccountByWorktreeId,
        worktreeId,
        accountId
      )
    })
  } catch (error) {
    // The startup spawn already carries the account; later terminals follow the global one.
    console.warn('worktree create: could not save the Claude account', worktreeId, error)
  }
}

export async function saveProjectDefaultClaudeAccount(
  repoId: string,
  accountId: string | null
): Promise<void> {
  const { settings, updateSettings } = useAppStore.getState()
  await updateSettings({
    claudeAccountDefaultByRepoId: withClaudeAccountEntry(
      settings?.claudeAccountDefaultByRepoId,
      repoId,
      accountId
    )
  })
}
