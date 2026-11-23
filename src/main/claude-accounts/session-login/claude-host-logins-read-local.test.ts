import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { claudeConfigDirEnv, readClaudeHostLogins } from './claude-host-logins-read'

describe('the Claude logins a host can run a chat on (local)', () => {
  let home: string
  beforeEach(() => {
    home = realpathSync(mkdtempSync(join(tmpdir(), 'host-logins-')))
    vi.stubEnv('CLAUDE_CONFIG_DIR', '')
    mkdirSync(join(home, '.claude'), { recursive: true })
    signIn(join(home, '.claude.json'), 'me@robotec.ai', 'robotec')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(home, { recursive: true, force: true })
  })

  function signIn(file: string, emailAddress: string, organizationUuid: string): void {
    writeFileSync(file, JSON.stringify({ oauthAccount: { emailAddress, organizationUuid } }))
  }
  function extra(name: string): string {
    const dir = join(home, '.claude-logins', name)
    mkdirSync(dir, { recursive: true })
    return dir
  }
  const row = (configDir: string, connectionId: string | null = null) => ({
    connectionId,
    providerSession: { transcriptPath: join(configDir, 'projects', '-repo', 's.jsonl') }
  })

  it("lists the system login and the box's extra ones, and leaves out a signed-out folder", async () => {
    const personal = extra('personal')
    signIn(join(personal, '.claude.json'), 'me@gmail.com', 'own')
    extra('signed-out')
    expect(await readClaudeHostLogins({ rows: () => [], userHome: home })).toEqual([
      {
        configDir: join(home, '.claude'),
        accountId: null,
        email: 'me@robotec.ai',
        organizationName: null
      },
      { configDir: personal, accountId: null, email: 'me@gmail.com', organizationName: null }
    ])
    expect(claudeConfigDirEnv(join(home, '.claude'), home)).toBeUndefined()
    expect(claudeConfigDirEnv(personal, home)).toBe(personal)
  })

  it('lists a folder only its sessions name, but none of an SSH host', async () => {
    const other = join(home, 'elsewhere')
    const relayed = join(home, 'relayed')
    for (const [dir, email] of [
      [other, 'other@x.com'],
      [relayed, 'relayed@x.com']
    ] as const) {
      mkdirSync(dir)
      signIn(join(dir, '.claude.json'), email, email)
    }
    const logins = await readClaudeHostLogins({
      rows: () => [row(other), row(relayed, 'ssh-1')],
      userHome: home
    })
    expect(logins.map((login) => login.email)).toEqual(['me@robotec.ai', 'other@x.com'])
  })

  it("lists one login once, by the chat's own folder when two hold it", async () => {
    const copy = extra('robotec-copy')
    signIn(join(copy, '.claude.json'), 'Me@Robotec.ai', 'robotec')
    symlinkSync(join(home, '.claude'), join(home, 'linked'))
    const rows = () => [row(join(home, 'linked'))]
    const plain = await readClaudeHostLogins({ rows, userHome: home })
    expect(plain.map((login) => login.configDir)).toEqual([join(home, '.claude')])
    const preferred = await readClaudeHostLogins({ rows, userHome: home }, copy)
    expect(preferred.map((login) => login.configDir)).toEqual([copy])
  })
})
