import type { ClaudeManagedAccount } from '../../../shared/managed-account-types'
import type { AppState } from '@/store/types'
import { projectDefaultClaudeAccountId } from '../../../shared/claude-workspace-account'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import { projectMatchesRepo } from '../../../shared/project-repo-match'
import { getProjectIdentityKey } from '../../../shared/project-host-setup-projection'
import { getProjectHostSetupProjectionFromState } from '@/store/projects/project-host-setup-selector'

type State = Pick<AppState, 'repos' | 'settings'> &
  Partial<Pick<AppState, 'projects' | 'projectHostSetups'>>

/**
 * The default Claude subscription of the project a workspace belongs to, wherever the workspace
 * runs (Paweł, 2026-11-10: "I always have to open chrome in profile that is default for given
 * project", whatever account the chat itself uses). A remote machine's copy of a project has
 * that host's own repo record, so the default is looked up on every repo of the project, found
 * as the sidebar groups it (the project's colour on activity cards is found the same way).
 */
export function projectDefaultClaudeAccount(
  state: State,
  worktreeId: string | null | undefined
): ClaudeManagedAccount | null {
  const settings = state.settings
  if (!settings || !worktreeId || !state.repos) {
    return null
  }
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const { projects, setups } = getProjectHostSetupProjectionFromState(state)
  const record = state.repos.find((entry) => entry.id === repoId)
  const projectId =
    setups.find((setup) => setup.repoId === repoId)?.projectId ??
    projects.find((entry) => projectMatchesRepo(entry, repoId))?.id ??
    (record ? getProjectIdentityKey(record) : undefined)
  const project = projectId ? projects.find((entry) => entry.id === projectId) : undefined
  const repoIds = new Set<string>([repoId])
  for (const setup of setups) {
    if (projectId && setup.projectId === projectId) {
      repoIds.add(setup.repoId)
    }
  }
  for (const repo of state.repos) {
    if (
      (project && projectMatchesRepo(project, repo.id)) ||
      (projectId && getProjectIdentityKey(repo) === projectId)
    ) {
      repoIds.add(repo.id)
    }
  }
  const accounts = settings.claudeManagedAccounts ?? []
  for (const candidate of repoIds) {
    const accountId = projectDefaultClaudeAccountId(settings, candidate)
    const account = accountId ? accounts.find((entry) => entry.id === accountId) : undefined
    if (account) {
      return account
    }
  }
  return null
}
