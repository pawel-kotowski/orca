import { translate } from '@/i18n/i18n'
import type { AppState } from '../../../types'
import type { NewBrowserTabProfile } from '../browser-slice-contract'
import { findFirstIndexedWorktree } from '../../../../lib/workspace/ownership/worktree-runtime-owner-index'
import { getResourceExecutionHostIdForWorktree } from '../../../../lib/workspace/ownership/worktree-runtime-owner'
import {
  getBrowserProfileHostId,
  getDefaultBrowserProfileForHost
} from '../hosts/browser-host-state'
import {
  selectFolderWorkspaces,
  selectWorktreesByRepo
} from '../../../workspaces/catalog/workspace-record-fields'
import { parseWorkspaceKey } from '../../../../../../shared/workspace/identity/workspace-scope'
import {
  getRepoExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../../../shared/execution-host/execution-host'
import {
  accountBrowserProfileOwner,
  getManagedBrowserProfileOwner,
  type ManagedBrowserProfileOwner
} from '../../../../../../shared/browser/profiles/browser-profile-scope'
import { claudeAccountOrgName } from '../../../../../../shared/agent-accounts/claude-account-org-name'
import { projectDefaultClaudeAccount } from '../../../../lib/project-default-claude-identity'
import { getRepoIdFromWorktreeId } from '../../../../../../shared/worktree/id'

/**
 * Profile a new tab gets when its caller names none: the repo's pick, else under the account scope
 * the profile of the project's default Claude subscription (the Mac owner's own when it has none),
 * else the workspace's own under a repo or workspace scope, else the host default.
 */
export function resolveNewBrowserTabProfile(
  state: AppState,
  worktreeId: string,
  hostId: ExecutionHostId
): NewBrowserTabProfile {
  const repoProfileId = getRepoBrowserProfileId(state, worktreeId, hostId)
  if (repoProfileId !== undefined) {
    return { sessionProfileId: repoProfileId }
  }
  const hostKind = parseExecutionHostId(hostId)?.kind
  // Why local and SSH only: those pages render on this desktop's profiles; a paired host's pages use its own.
  const onThisDesktop = hostKind === 'local' || hostKind === 'ssh'
  const scope = state.settings?.browserProfileScope
  if (onThisDesktop && scope === 'account') {
    const email = projectDefaultClaudeAccount(state, worktreeId)?.email ?? null
    return state.ensureManagedBrowserSessionProfile(
      accountBrowserProfileOwner(email),
      accountProfileLabel(email)
    )
  }
  const owner = onThisDesktop ? getManagedBrowserProfileOwner(scope, worktreeId) : null
  if (owner) {
    return state.ensureManagedBrowserSessionProfile(
      owner,
      managedProfileLabel(state, owner, worktreeId)
    )
  }
  return { sessionProfileId: getDefaultBrowserProfileForHost(state, hostId) }
}

/** The repo's own profile pick (null = Default), or undefined to follow the Browser setting. */
export function getRepoBrowserProfileId(
  state: AppState,
  worktreeId: string,
  hostId: ExecutionHostId
): string | null | undefined {
  if (parseWorkspaceKey(worktreeId)?.type === 'folder') {
    return undefined
  }
  // Why the workspace's owner: agent opens name an SSH page by this desktop, but the pick lives on the SSH row.
  const ownerHostId = getResourceExecutionHostIdForWorktree(state, worktreeId)
  const profileHostId = getBrowserProfileHostId(hostId)
  // Profile ids belong to one host's list, so a pick can't name a profile on another host.
  if (getBrowserProfileHostId(ownerHostId) !== profileHostId) {
    return undefined
  }
  const repoId = getRepoIdFromWorktreeId(worktreeId)
  const profileId = state.repos.find(
    (repo) => repo.id === repoId && getRepoExecutionHostId(repo) === ownerHostId
  )?.browserProfileId
  if (typeof profileId !== 'string' || !profileId) {
    return undefined
  }
  if (profileId === 'default') {
    return null
  }
  const profiles = state.browserSessionProfilesByHostId[profileHostId]
  // A deleted pick would load nowhere, so it falls back; only a real listing (it always has Default) proves deletion.
  if (
    profiles?.some((profile) => profile.id === 'default') &&
    !profiles.some((profile) => profile.id === profileId)
  ) {
    return undefined
  }
  return profileId
}

function managedProfileLabel(
  state: AppState,
  owner: ManagedBrowserProfileOwner,
  worktreeId: string
): string {
  if (owner.kind === 'repo') {
    const name = state.repos.find((repo) => repo.id === owner.id)?.displayName ?? owner.id
    return translate('settings.browser.profileScope.repoProfileLabel', 'Repo: {{name}}', { name })
  }
  const scope = parseWorkspaceKey(worktreeId)
  const name =
    (scope?.type === 'folder'
      ? selectFolderWorkspaces(state).find((folder) => folder.id === scope.folderWorkspaceId)?.name
      : findFirstIndexedWorktree(selectWorktreesByRepo(state), worktreeId)?.displayName) ||
    worktreeId
  return translate('settings.browser.profileScope.worktreeProfileLabel', 'Workspace: {{name}}', {
    name
  })
}

/** An account profile is named like the chat's subscription: its organisation, else its email, else Personal. */
function accountProfileLabel(email: string | null): string {
  if (!email) {
    return translate('settings.browser.profileScope.macOwnerProfileLabel', 'Personal')
  }
  return claudeAccountOrgName(email) ?? email
}
