import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getPosixClaudeShellFunction } from '../../../../shared/shell/launch/agents/claude-shell-function'
import {
  CLAUDE_INJECTED_CONFIG_DIR_ENV,
  CLAUDE_PROFILE_POINTER_ENV
} from '../../../../shared/agent-accounts/claude/claude-profile-routing'
import { withClaudeResumeFolder } from './claude-resume-folder-env'
import { claudeResumeFolderFor } from './claude-profile-installed-router'
import { CLAUDE_RESUME_CONFIG_DIR_ENV } from '../../../../shared/agent-launch/startup/claude-resume-account'

// Local-only test: Orca's own resume after an Orca restart runs a session in the folder it last
// ran in, not the workspace's account (Paweł, 2026-11-20, after limit-move's moves were undone).
describe('a resumed Claude runs in the folder its session last ran in (local)', () => {
  let root: string
  let bin: string
  let managed: string
  let pointer: string
  let extra: string
  let system: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'resume-folder-'))
    bin = join(root, 'bin')
    managed = join(root, 'claude-profiles', 'acct', 'home')
    extra = join(root, '.claude-logins', 'personal')
    system = join(root, '.claude')
    for (const dir of [bin, managed, extra, system]) {
      mkdirSync(dir, { recursive: true })
    }
    // A stand-in claude that reports the folder it was started in.
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\necho "dir=${CLAUDE_CONFIG_DIR:-<unset>}"\n')
    chmodSync(join(bin, 'claude'), 0o755)
    pointer = join(root, 'selected-host-workspace-acct')
    writeFileSync(pointer, managed)
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  /** The env Orca's routing gives a pane on the managed account, as terminalEnv builds it. */
  const accountEnv = (): Record<string, string> => ({
    [CLAUDE_PROFILE_POINTER_ENV]: pointer,
    CLAUDE_CONFIG_DIR: managed,
    [CLAUDE_INJECTED_CONFIG_DIR_ENV]: managed
  })

  /** What `claude --resume` typed into that pane starts in, through Orca's shell function. */
  function launchedIn(env: Record<string, string>): string {
    const out = execFileSync(
      '/bin/zsh',
      ['-f', '-c', `${getPosixClaudeShellFunction()}\nclaude --resume s1`],
      { env: { PATH: `${bin}:/usr/bin:/bin`, HOME: root, ...env }, encoding: 'utf8' }
    )
    return out.trim()
  }

  const host = (): {
    systemDefaultHome: string
    userConfigDir: string | undefined
    routed: boolean
  } => ({
    systemDefaultHome: system,
    userConfigDir: undefined,
    routed: true
  })

  it('without a folder, the pane runs on its routed account (the bug)', () => {
    expect(launchedIn(accountEnv())).toBe(`dir=${managed}`)
  })

  it('a folder Orca never made, such as limit-move’s extra login, wins over the account', () => {
    expect(launchedIn(withClaudeResumeFolder(accountEnv(), extra, host()))).toBe(`dir=${extra}`)
  })

  it('the host’s own folder runs the system login, with no CLAUDE_CONFIG_DIR', () => {
    expect(launchedIn(withClaudeResumeFolder(accountEnv(), system, host()))).toBe('dir=<unset>')
  })

  it('the host’s own folder is the user’s CLAUDE_CONFIG_DIR when they set one', () => {
    const env = withClaudeResumeFolder(accountEnv(), system, { ...host(), userConfigDir: system })
    expect(launchedIn({ ...env, ORCA_CLAUDE_USER_CONFIG_DIR: system })).toBe(`dir=${system}`)
  })

  it('a folder that is gone leaves the normal routing', () => {
    const gone = join(root, '.claude-logins', 'removed')
    expect(withClaudeResumeFolder(accountEnv(), gone, host())).toEqual(accountEnv())
  })

  it('a host without Orca’s routing (a box) gets the folder as its env', () => {
    expect(withClaudeResumeFolder({ PATH: '/bin' }, extra, { ...host(), routed: false })).toEqual({
      PATH: '/bin',
      CLAUDE_CONFIG_DIR: extra
    })
  })

  it('a spawn whose resume names a usable folder skips the routed account’s auth', () => {
    const host = { runtime: 'host' as const }
    expect(claudeResumeFolderFor({ [CLAUDE_RESUME_CONFIG_DIR_ENV]: extra }, host)).toBe(extra)
    expect(
      claudeResumeFolderFor({ [CLAUDE_RESUME_CONFIG_DIR_ENV]: join(root, 'gone') }, host)
    ).toBeNull()
    expect(
      claudeResumeFolderFor({ [CLAUDE_RESUME_CONFIG_DIR_ENV]: extra }, { runtime: 'wsl' })
    ).toBeNull()
    expect(claudeResumeFolderFor({}, host)).toBeNull()
  })
})
