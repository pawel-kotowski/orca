import { describe, expect, it } from 'vitest'
import {
  launchClaudeAccountId,
  projectDefaultClaudeAccountId,
  withClaudeAccountEntry,
  workspaceClaudeAccountId,
  type ClaudeWorkspaceAccountSettings
} from './claude-workspace-account'

const account = (id: string, managedAuthRuntime?: 'host' | 'wsl') => ({
  id,
  email: `${id}@example.test`,
  managedAuthPath: '',
  authMethod: 'subscription-oauth' as const,
  createdAt: 0,
  updatedAt: 0,
  lastAuthenticatedAt: 0,
  ...(managedAuthRuntime ? { managedAuthRuntime } : {})
})

const settings: ClaudeWorkspaceAccountSettings = {
  claudeManagedAccounts: [account('mos'), account('personal', 'host'), account('wsl', 'wsl')],
  claudeAccountByWorktreeId: { wt1: 'mos', wt2: 'removed', wt3: 'wsl' },
  claudeAccountDefaultByRepoId: { mosRepo: 'mos', oldRepo: 'removed' }
}

describe('workspace Claude accounts', () => {
  it('reads only saved host accounts', () => {
    expect(workspaceClaudeAccountId(settings, 'wt1')).toBe('mos')
    expect(workspaceClaudeAccountId(settings, 'wt2')).toBeNull()
    expect(workspaceClaudeAccountId(settings, 'wt3')).toBeNull()
    expect(workspaceClaudeAccountId(settings, undefined)).toBeNull()
    expect(projectDefaultClaudeAccountId(settings, 'mosRepo')).toBe('mos')
    expect(projectDefaultClaudeAccountId(settings, 'oldRepo')).toBeNull()
    expect(projectDefaultClaudeAccountId({}, 'mosRepo')).toBeNull()
  })

  it("puts a launch's own request ahead of its workspace's account", () => {
    expect(launchClaudeAccountId(settings, 'personal', 'wt1')).toBe('personal')
    expect(launchClaudeAccountId(settings, 'removed', 'wt1')).toBe('mos')
    expect(launchClaudeAccountId(settings, null, 'wt2')).toBeNull()
  })

  it('writes a new record and drops an entry set to none', () => {
    const record = { a: 'x' }
    expect(withClaudeAccountEntry(record, 'b', 'y')).toEqual({ a: 'x', b: 'y' })
    expect(withClaudeAccountEntry(record, 'a', null)).toEqual({})
    expect(record).toEqual({ a: 'x' })
    expect(withClaudeAccountEntry(undefined, 'a', 'x')).toEqual({ a: 'x' })
  })
})
