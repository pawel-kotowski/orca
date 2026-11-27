import { describe, expect, it } from 'vitest'
import { REPEATED_FLAG_SEPARATOR } from '../arguments/args'
import {
  readCliChatLaunch,
  redactChatLaunchArgs,
  redactChatLaunchParams
} from './chat-launch-profile-flags'

describe('orca agent launch chat profile flags', () => {
  it('merges the JSON profile with the single flags', () => {
    const flags = new Map<string, string | boolean>([
      ['chat-profile', JSON.stringify({ args: ['--settings', '/s.json'], env: { A: '1' } })],
      ['env', `B=2${REPEATED_FLAG_SEPARATOR}C=x=y`],
      ['claude-config-dir', 'logins/backup'],
      ['append-system-prompt-file', '/state/system.md'],
      ['resume', 'abc-123'],
      ['permission-mode', 'full-access']
    ])
    expect(readCliChatLaunch(flags, '/home/me')).toEqual({
      chatLaunchProfile: {
        args: ['--settings', '/s.json'],
        env: { A: '1', B: '2', C: 'x=y' },
        claudeConfigDir: '/home/me/logins/backup',
        appendSystemPromptFile: '/state/system.md'
      },
      resumeFrom: { providerSessionId: 'abc-123' },
      chatOptions: { permissionMode: 'full-access' }
    })
  })

  it('refuses the login in the environment and an unknown mode', () => {
    expect(() => readCliChatLaunch(new Map([['env', 'CLAUDE_CONFIG_DIR=/x']]), '/')).toThrow(
      /claudeConfigDir/
    )
    expect(() => readCliChatLaunch(new Map([['permission-mode', 'yolo']]), '/')).toThrow(
      /permission-mode/
    )
  })

  it('is empty without its flags', () => {
    expect(readCliChatLaunch(new Map(), '/')).toEqual({})
  })

  it('needs absolute paths on another host', () => {
    expect(() =>
      readCliChatLaunch(new Map([['append-system-prompt-file', 'system.md']]), '/here', true)
    ).toThrow(/absolute path on the Orca host/)
  })

  it('never shows environment values in an error', () => {
    expect(
      redactChatLaunchArgs([
        'agent',
        '--env',
        'TOKEN=secret',
        '--chat-profile',
        JSON.stringify({ env: { KEY: 'v' }, args: ['--model', 'opus'] })
      ])
    ).toEqual([
      'agent',
      '--env',
      'TOKEN=<redacted>',
      '--chat-profile',
      JSON.stringify({ env: { KEY: '<redacted>' }, args: ['--model', 'opus'] })
    ])
    expect(
      redactChatLaunchParams({ chatLaunchProfile: { env: { K: 'v' } }, agent: 'claude' })
    ).toEqual({
      chatLaunchProfile: { env: { K: '<redacted>' } },
      agent: 'claude'
    })
  })
})
