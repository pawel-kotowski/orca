import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { claudeLaunchFlags, claudeRecordedFlags, claudeResumeLine } from './claude-resume-line'

describe('the line that resumes a session on another login (local)', () => {
  it('keeps the launch flags and drops the first prompt and what named the session', () => {
    expect(
      claudeLaunchFlags([
        '--plugin-dir',
        '/p/agent view',
        '--dangerously-skip-permissions',
        '--model=opus',
        '--effort',
        'high',
        '--resume',
        'old-id',
        '--continue',
        'Go on from where you stopped'
      ])
    ).toEqual([
      '--plugin-dir',
      '/p/agent view',
      '--dangerously-skip-permissions',
      '--model=opus',
      '--effort',
      'high'
    ])
    expect(
      claudeRecordedFlags(
        { agentCommand: "claude '--model' 'opus' 'hello'", agentArgs: '', agentEnv: {} },
        'posix'
      )
    ).toEqual(['--model', 'opus'])
    expect(
      claudeRecordedFlags({ agentArgs: '--dangerously-skip-permissions', agentEnv: {} }, 'posix')
    ).toEqual(['--dangerously-skip-permissions'])
  })

  const base = {
    sessionId: 's-1',
    newSession: false,
    flags: ['--model', 'opus', "it's; rm"],
    env: { FOO: 'a b', CLAUDE_CONFIG_DIR: '/stale' },
    cwd: '/',
    shell: 'posix' as const
  }

  /** What the typed line really starts, in a shell that carries the last login's own variables. */
  function run(configDirEnv: string | undefined): string {
    const line = claudeResumeLine({ ...base, configDirEnv }).replace(
      ' claude ',
      ` sh -c 'echo "$PWD|\${CLAUDE_CONFIG_DIR-unset}|\${ENABLE_CLAUDEAI_MCP_SERVERS-unset}|$FOO|$*"' claude `
    )
    return execFileSync('/bin/sh', ['-c', line], {
      env: {
        PATH: '/usr/bin:/bin',
        CLAUDE_CONFIG_DIR: '/old',
        ENABLE_CLAUDEAI_MCP_SERVERS: 'false'
      },
      encoding: 'utf8'
    }).trim()
  }

  it('runs an extra login in its folder and the system login with no folder at all', () => {
    expect(run('/home/p/.claude logins/x')).toBe(
      "/|/home/p/.claude logins/x|unset|a b|--model opus it's; rm --resume s-1"
    )
    expect(run(undefined)).toBe("/|unset|unset|a b|--model opus it's; rm --resume s-1")
  })

  it('starts the id fresh when no transcript was written, and speaks PowerShell', () => {
    expect(
      claudeResumeLine({
        ...base,
        newSession: true,
        flags: [],
        env: {},
        configDirEnv: 'C:\\x',
        cwd: null,
        shell: 'powershell'
      })
    ).toMatch(
      /Remove-Item Env:CLAUDE_CONFIG_DIR.*\$env:CLAUDE_CONFIG_DIR='C:\\x'; claude --session-id 's-1'$/
    )
  })
})
