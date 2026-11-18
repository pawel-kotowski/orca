import { FLOATING_TERMINAL_WORKTREE_ID } from '../../workspace/identity/floating-workspace-id'
import { getRepoIdFromWorktreeId } from '../../worktree/id'
import { parseWorkspaceKey } from '../../workspace/identity/workspace-scope'

/**
 * Which browser profile new tabs in a workspace use: the shared Default, or one Orca manages per
 * repo, per workspace, or per Claude account (the project's default subscription, else the Mac
 * owner's own), filled from that account's Chrome profile.
 */
export type BrowserProfileScope = 'shared' | 'repo' | 'worktree' | 'account'

/**
 * `account` profiles are keyed by the subscription's lowercased email, or by
 * `ACCOUNT_BROWSER_PROFILE_MAC_OWNER` for projects with no default subscription. They outlive
 * any repo or workspace, so nothing deletes them with an owner.
 */
export type ManagedBrowserProfileOwner = { kind: 'repo' | 'worktree' | 'account'; id: string }

export const ACCOUNT_BROWSER_PROFILE_MAC_OWNER = 'mac-owner'

export function isManagedBrowserProfileOwnerKind(
  kind: unknown
): kind is ManagedBrowserProfileOwner['kind'] {
  return kind === 'repo' || kind === 'worktree' || kind === 'account'
}

/** The account owner for a project's default subscription email, or the Mac owner's when there is none. */
export function accountBrowserProfileOwner(email: string | null): ManagedBrowserProfileOwner {
  const id = email?.trim().toLowerCase()
  return { kind: 'account', id: id || ACCOUNT_BROWSER_PROFILE_MAC_OWNER }
}

export function getManagedBrowserProfileOwner(
  scope: BrowserProfileScope | undefined,
  worktreeId: string
): ManagedBrowserProfileOwner | null {
  if ((scope !== 'repo' && scope !== 'worktree') || worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
    return null
  }
  // Why: a standalone folder workspace belongs to no repo, so it owns its profile under either scope.
  if (scope === 'repo' && parseWorkspaceKey(worktreeId)?.type !== 'folder') {
    return { kind: 'repo', id: getRepoIdFromWorktreeId(worktreeId) }
  }
  return { kind: 'worktree', id: worktreeId }
}

export function managedBrowserProfileOwnerKey(owner: ManagedBrowserProfileOwner): string {
  return `${owner.kind}:${owner.id}`
}

export function isManagedBrowserProfileOf(
  profile: { owner?: ManagedBrowserProfileOwner },
  owner: ManagedBrowserProfileOwner
): boolean {
  return profile.owner?.kind === owner.kind && profile.owner.id === owner.id
}

/** A partition main never admits, so a tab whose profile main has not made, or has deleted, loads nowhere. */
export function unadmittedBrowserPartition(profileId: string): string {
  return `persist:orca-browser-unminted-${profileId}`
}
