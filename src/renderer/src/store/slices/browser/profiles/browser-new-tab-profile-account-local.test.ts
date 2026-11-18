import { describe, expect, it, vi } from 'vitest'
import type { ClaudeManagedAccount } from '../../../../../../shared/agent-accounts/managed-account-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../../shared/execution-host/execution-host'

vi.mock('@/store/projects/project-host-setup-selector', () => ({
  getProjectHostSetupProjectionFromState: (state: { projects: unknown }) => ({
    projects: state.projects,
    setups: []
  })
}))

import { resolveNewBrowserTabProfile } from './browser-new-tab-profile'

const kyotu = { id: 'acct-kyotu', email: 'Pawel@KyotuTechnology.com' } as ClaudeManagedAccount
const trading = { id: 'acct-me', email: 'p@gmail.com' } as ClaudeManagedAccount

function state(scope: string | undefined, browserProfileId?: string) {
  const ensure = vi.fn(() => ({ sessionProfileId: 'managed' }))
  const value = {
    settings: {
      browserProfileScope: scope,
      claudeManagedAccounts: [kyotu, trading],
      claudeAccountDefaultByRepoId: { 'repo-mac': 'acct-kyotu', 'repo-trading': 'acct-me' }
    },
    repos: [
      { id: 'repo-mac', displayName: 'mac', ...(browserProfileId ? { browserProfileId } : {}) },
      { id: 'repo-trading', displayName: 'trading' },
      { id: 'repo-rick', displayName: 'rick' }
    ],
    projects: [],
    browserSessionProfilesByHostId: {},
    browserDefaultProfileIdByHostId: {},
    worktreesByRepo: {},
    ensureManagedBrowserSessionProfile: ensure
  }
  return { value: value as unknown as Parameters<typeof resolveNewBrowserTabProfile>[0], ensure }
}

describe('the per-account browser profile scope', () => {
  it("opens a project's tabs in the profile of its default Claude account", () => {
    const { value, ensure } = state('account')
    expect(resolveNewBrowserTabProfile(value, 'repo-mac::/w/mac', LOCAL_EXECUTION_HOST_ID)).toEqual(
      { sessionProfileId: 'managed' }
    )
    expect(ensure).toHaveBeenCalledWith(
      { kind: 'account', id: 'pawel@kyotutechnology.com' },
      'kyotutechnology'
    )
  })

  it("gives a project with no default the Mac owner's Personal profile", () => {
    const { value, ensure } = state('account')
    resolveNewBrowserTabProfile(value, 'repo-rick::/w/rick', LOCAL_EXECUTION_HOST_ID)
    expect(ensure).toHaveBeenCalledWith({ kind: 'account', id: 'mac-owner' }, 'Personal')
  })

  it('names a personal-mailbox subscription by its email, apart from Personal', () => {
    const { value, ensure } = state('account')
    resolveNewBrowserTabProfile(value, 'repo-trading::/w/trading', LOCAL_EXECUTION_HOST_ID)
    expect(ensure).toHaveBeenCalledWith({ kind: 'account', id: 'p@gmail.com' }, 'p@gmail.com')
  })

  it("leaves a paired host's own pages alone", () => {
    const { value, ensure } = state('account')
    resolveNewBrowserTabProfile(value, 'repo-mac::/w/mac', 'runtime:box' as never)
    expect(ensure).not.toHaveBeenCalled()
  })

  it('makes no account profile under the other scopes', () => {
    const { value, ensure } = state('shared')
    resolveNewBrowserTabProfile(value, 'repo-mac::/w/mac', LOCAL_EXECUTION_HOST_ID)
    expect(ensure).not.toHaveBeenCalled()
  })
})
