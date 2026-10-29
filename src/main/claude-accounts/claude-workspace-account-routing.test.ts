import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeManagedAccount } from '../../shared/managed-account-types'
import { CLAUDE_WORKSPACE_ACCOUNT_ENV } from '../../shared/claude-workspace-account'
import type { ClaudeProfileSetupReport } from './claude-profile-setup'
import { claudeProfileMarkerPath, type ClaudeProfileDescriptor } from './claude-profile-paths'
import { ClaudeProfileRouter, type ClaudeProfileRouterSettings } from './claude-profile-router'
import {
  claudeSpawnSelectionTarget,
  installClaudeProfileRouter,
  withClaudeProfileTerminalEnv
} from './claude-profile-installed-router'

vi.mock('../startup/login-shell-environment', () => ({
  resolveLoginShellEnvironment: () => Promise.resolve({})
}))

const roots: string[] = []
afterEach(() => {
  installClaudeProfileRouter(undefined)
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

function account(id: string, extra: Partial<ClaudeManagedAccount> = {}): ClaudeManagedAccount {
  return {
    id,
    email: `${id}@example.test`,
    authMethod: 'subscription-oauth',
    managedAuthPath: '/unused-legacy',
    createdAt: 0,
    updatedAt: 0,
    lastAuthenticatedAt: 0,
    ...extra
  }
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'claude-workspace-account-'))
  roots.push(root)
  const dataRoot = join(root, 'data')
  const userHome = join(root, 'personal')
  mkdirSync(join(userHome, '.claude'), { recursive: true })
  const settings: ClaudeProfileRouterSettings = {
    claudeManagedAccounts: [
      account('a'),
      account('b'),
      account('w', { managedAuthRuntime: 'wsl' })
    ],
    activeClaudeManagedAccountId: 'a',
    activeClaudeManagedAccountIdsByRuntime: undefined,
    agentStatusHooksEnabled: false,
    disabledTuiAgents: [],
    claudeAccountByWorktreeId: { 'repo::/wt/mos': 'b' }
  }
  const runSetup = async ({ profile }: { profile: ClaudeProfileDescriptor }) => {
    mkdirSync(profile.home, { recursive: true })
    writeFileSync(claudeProfileMarkerPath(profile), '{}')
    return { outcome: 'prepared', warnings: [], surfaces: {} } as ClaudeProfileSetupReport
  }
  const router = new ClaudeProfileRouter({
    getSettings: () => settings,
    dataRoot,
    userHome,
    env: { HOME: userHome },
    runSetup,
    refreshWaitMs: 50
  })
  const home = (id: string) => join(dataRoot, 'claude-profiles', id, 'home')
  for (const id of ['a', 'b']) {
    mkdirSync(home(id), { recursive: true })
  }
  installClaudeProfileRouter(router)
  return { settings, router, home }
}

describe('a workspace with its own Claude account', () => {
  it('starts its terminals on that account behind a pointer the global switch never moves', () => {
    const f = fixture()
    const target = claudeSpawnSelectionTarget({ runtime: 'host' }, { worktreeId: 'repo::/wt/mos' })
    expect(target).toEqual({ runtime: 'host', workspaceAccountId: 'b' })
    const shellEnv: Record<string, string> = { TERM: 'xterm' }
    const env = withClaudeProfileTerminalEnv(shellEnv, target)
    const pointer = env.ORCA_CLAUDE_PROFILE_POINTER!
    expect(pointer).not.toBe(f.router.pointerPath)
    expect(env).toMatchObject({
      TERM: 'xterm',
      CLAUDE_CONFIG_DIR: f.home('b'),
      ORCA_CLAUDE_INJECTED_CONFIG_DIR: f.home('b')
    })
    expect(readFileSync(pointer, 'utf8')).toBe(f.home('b'))

    f.router.publish()
    f.settings.activeClaudeManagedAccountId = 'b'
    f.router.publish()
    f.settings.activeClaudeManagedAccountId = 'a'
    f.router.publish()
    expect(readFileSync(f.router.pointerPath, 'utf8')).toBe(f.home('a'))
    expect(readFileSync(pointer, 'utf8')).toBe(f.home('b'))
  })

  it('launches claude directly on that account', async () => {
    const f = fixture()
    await expect(f.router.prepareLaunch('b')).resolves.toMatchObject({
      configDir: f.home('b'),
      envPatch: { CLAUDE_CONFIG_DIR: f.home('b') }
    })
    await expect(f.router.prepareLaunch()).resolves.toMatchObject({ configDir: f.home('a') })
  })

  it('takes the account a launch asked for, and never passes the request on', () => {
    const f = fixture()
    const spawnEnv: Record<string, string> = { [CLAUDE_WORKSPACE_ACCOUNT_ENV]: 'a', TERM: 'xterm' }
    const target = claudeSpawnSelectionTarget(
      { runtime: 'host' },
      { env: spawnEnv, worktreeId: 'repo::/wt/mos' }
    )
    expect(target.workspaceAccountId).toBe('a')
    const env = withClaudeProfileTerminalEnv(spawnEnv, target)
    expect(env).not.toHaveProperty(CLAUDE_WORKSPACE_ACCOUNT_ENV)
    expect(env.CLAUDE_CONFIG_DIR).toBe(f.home('a'))
  })

  it('follows the global selection once its account is removed, or for WSL and other workspaces', () => {
    const f = fixture()
    expect(claudeSpawnSelectionTarget({ runtime: 'host' }, { worktreeId: 'other' })).toEqual({
      runtime: 'host'
    })
    expect(
      claudeSpawnSelectionTarget(
        { runtime: 'wsl', wslDistro: 'Ubuntu' },
        { worktreeId: 'repo::/wt/mos' }
      )
    ).toEqual({ runtime: 'wsl', wslDistro: 'Ubuntu' })
    expect(f.router.accountForLaunch('w', null)).toBeNull()
    f.settings.claudeManagedAccounts = f.settings.claudeManagedAccounts.filter(
      (saved) => saved.id !== 'b'
    )
    const target = claudeSpawnSelectionTarget({ runtime: 'host' }, { worktreeId: 'repo::/wt/mos' })
    expect(target).toEqual({ runtime: 'host' })
    expect(withClaudeProfileTerminalEnv({}, target)).toMatchObject({
      ORCA_CLAUDE_PROFILE_POINTER: f.router.pointerPath,
      CLAUDE_CONFIG_DIR: f.home('a')
    })
  })
})
