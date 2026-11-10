import { describe, expect, it, vi } from 'vitest'
import type { ClaudeManagedAccount } from '../../../shared/managed-account-types'

vi.mock('@/store/selectors', () => ({
  getProjectHostSetupProjectionFromState: (state: {
    projects: unknown
    projectHostSetups: unknown
  }) => ({
    projects: state.projects,
    setups: state.projectHostSetups
  })
}))

import { projectDefaultClaudeAccount } from './project-default-claude-identity'

const mos = { id: 'acct-mos', email: 'pawel@moshealth.com' } as ClaudeManagedAccount
const personal = { id: 'acct-personal', email: 'p@gmail.com' } as ClaudeManagedAccount

function state(setups: { projectId: string; repoId: string }[]) {
  return {
    settings: {
      claudeManagedAccounts: [mos, personal],
      claudeAccountDefaultByRepoId: { 'repo-local-mos': 'acct-mos' }
    },
    repos: [{ id: 'repo-local-mos' }, { id: 'repo-devbox-mos' }, { id: 'repo-rick' }],
    projects: [
      { id: 'project-mos', sourceRepoIds: ['repo-local-mos', 'repo-devbox-mos'] },
      { id: 'project-rick', sourceRepoIds: ['repo-rick'] }
    ],
    projectHostSetups: setups
  } as unknown as Parameters<typeof projectDefaultClaudeAccount>[0]
}

describe("a workspace's project default subscription", () => {
  it('reads the default of the repo it runs in', () => {
    expect(projectDefaultClaudeAccount(state([]), 'repo-local-mos::/Users/p/mos')?.id).toBe(
      'acct-mos'
    )
  })

  it("finds a remote copy's default through its project, with or without a setup", () => {
    expect(projectDefaultClaudeAccount(state([]), 'repo-devbox-mos::/home/p/mos')?.id).toBe(
      'acct-mos'
    )
    expect(
      projectDefaultClaudeAccount(
        state([{ projectId: 'project-mos', repoId: 'repo-devbox-mos' }]),
        'repo-devbox-mos::/home/p/mos'
      )?.id
    ).toBe('acct-mos')
  })

  it('is null for a project without a default', () => {
    expect(projectDefaultClaudeAccount(state([]), 'repo-rick::/Users/p/rick')).toBeNull()
  })
})
