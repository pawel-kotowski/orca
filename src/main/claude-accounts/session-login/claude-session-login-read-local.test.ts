import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import {
  CLAUDE_SESSION_USAGE_REFRESH_MS,
  keepRecentUsage,
  readClaudeSessionLogin,
  resetClaudeSessionLoginCacheForTests
} from './claude-session-login-read'

const MANAGED = 'e6945bb8-13b2-463f-abda-c22153bef8ff'

function limits(used: number, status: ProviderRateLimits['status'] = 'ok'): ProviderRateLimits {
  return {
    provider: 'claude',
    session: { usedPercent: used, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    updatedAt: 0,
    error: status === 'ok' ? null : 'failed',
    status
  }
}

function writeLogin(file: string, email: string, organizationName: string | null = null): void {
  writeFileSync(
    file,
    JSON.stringify({
      oauthAccount: { emailAddress: email, organizationUuid: 'org', organizationName }
    })
  )
}

describe('the login a Claude session runs on, read from its own folder', () => {
  let home: string
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'session-login-'))
    vi.stubEnv('CLAUDE_CONFIG_DIR', '')
    resetClaudeSessionLoginCacheForTests()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, { recursive: true, force: true })
  })

  const transcriptIn = (dir: string): string => join(dir, 'projects', '-repo', 'session-1.jsonl')

  it('names a folder Orca never made, such as a box limit-move login, with that login’s limits', async () => {
    const extra = join(home, '.claude-logins', 'personal')
    mkdirSync(extra, { recursive: true })
    writeLogin(join(extra, '.claude.json'), 'me@gmail.com')
    writeLogin(join(home, '.claude.json'), 'me@robotec.ai', 'Robotec')
    const fetchUsage = vi.fn(async () => limits(12))
    const login = await readClaudeSessionLogin(
      { transcriptPath: transcriptIn(extra) },
      {
        rows: () => [{ providerSession: { transcriptPath: transcriptIn(extra) } }],
        fetchUsage,
        userHome: home
      }
    )
    expect(login).toMatchObject({ configDir: extra, accountId: null, email: 'me@gmail.com' })
    expect(login?.limits?.session?.usedPercent).toBe(12)
    // The folder's own token is read: CLAUDE_CONFIG_DIR names it.
    expect(fetchUsage).toHaveBeenCalledWith(
      expect.objectContaining({ configDir: extra, envPatch: { CLAUDE_CONFIG_DIR: extra } })
    )
  })

  it('reads the system home’s login from ~/.claude.json, beside the folder', async () => {
    const system = join(home, '.claude')
    mkdirSync(system, { recursive: true })
    writeLogin(join(home, '.claude.json'), 'me@robotec.ai', 'Robotec')
    const fetchUsage = vi.fn(async () => limits(90))
    const login = await readClaudeSessionLogin(
      { transcriptPath: transcriptIn(system) },
      {
        rows: () => [{ providerSession: { transcriptPath: transcriptIn(system) } }],
        fetchUsage,
        userHome: home
      }
    )
    expect(login).toMatchObject({ email: 'me@robotec.ai', organizationName: 'Robotec' })
    // System default reads the unsuffixed login, never one named by CLAUDE_CONFIG_DIR.
    expect(fetchUsage).toHaveBeenCalledWith(expect.objectContaining({ envPatch: {} }))
  })

  it('names a managed profile by its account and leaves its usage to the account list', async () => {
    const managed = join(home, 'orca', 'claude-profiles', MANAGED, 'home')
    mkdirSync(managed, { recursive: true })
    writeLogin(join(managed, '.claude.json'), 'me@robotec.ai')
    const fetchUsage = vi.fn(async () => limits(1))
    const login = await readClaudeSessionLogin(
      { transcriptPath: transcriptIn(managed) },
      {
        rows: () => [{ providerSession: { transcriptPath: transcriptIn(managed) } }],
        fetchUsage,
        userHome: home
      }
    )
    expect(login).toMatchObject({ accountId: MANAGED, email: 'me@robotec.ai', limits: null })
    expect(fetchUsage).not.toHaveBeenCalled()
  })

  it('refuses a folder no session of this host runs in', async () => {
    const other = join(home, 'elsewhere')
    mkdirSync(other, { recursive: true })
    writeLogin(join(other, '.claude.json'), 'someone@else.com')
    expect(
      await readClaudeSessionLogin(
        { transcriptPath: transcriptIn(other) },
        {
          rows: () => [
            { providerSession: { transcriptPath: transcriptIn(join(home, '.claude')) } }
          ],
          userHome: home
        }
      )
    ).toBeNull()
    expect(
      await readClaudeSessionLogin(
        { transcriptPath: 'orca-ssh-transcript:c:/x/projects/a/b.jsonl' },
        { rows: () => [] }
      )
    ).toBeNull()
  })

  it('asks for a folder’s usage again only after the refresh interval, and keeps it through a failure', async () => {
    const extra = join(home, 'login')
    mkdirSync(extra, { recursive: true })
    writeLogin(join(extra, '.claude.json'), 'me@gmail.com')
    let now = 1_000
    const fetchUsage = vi
      .fn<() => Promise<ProviderRateLimits>>()
      .mockResolvedValueOnce({ ...limits(30), updatedAt: now })
      .mockResolvedValueOnce(limits(0, 'error'))
    const deps = {
      rows: () => [{ providerSession: { transcriptPath: transcriptIn(extra) } }],
      fetchUsage,
      now: () => now,
      userHome: home
    }
    const args = { transcriptPath: transcriptIn(extra) }
    expect((await readClaudeSessionLogin(args, deps))?.limits?.session?.usedPercent).toBe(30)
    now += CLAUDE_SESSION_USAGE_REFRESH_MS - 1
    await readClaudeSessionLogin(args, deps)
    expect(fetchUsage).toHaveBeenCalledTimes(1)
    now += 1
    const after = await readClaudeSessionLogin(args, deps)
    expect(fetchUsage).toHaveBeenCalledTimes(2)
    expect(after?.limits).toMatchObject({ status: 'error', session: { usedPercent: 30 } })
  })

  it('drops kept usage once it is stale', () => {
    const previous = { ...limits(30), updatedAt: 0 }
    expect(
      keepRecentUsage(limits(0, 'error'), previous, 24 * 60 * 60 * 1000).session
    ).toMatchObject({
      usedPercent: 0
    })
  })
})
