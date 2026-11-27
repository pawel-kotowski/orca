import { describe, expect, it } from 'vitest'
import {
  claudeChatLaunchProfileParts,
  claudeChatProfileAccount,
  claudeChatProfileArgsRefusal,
  expandChatProfileEnv,
  splitToolRules,
  withProfileSystemPrompt
} from './claude-chat-launch-profile'

describe('claude chat launch profile', () => {
  it('splits arguments, tool lists, environment, prompt file and login', async () => {
    const parts = await claudeChatLaunchProfileParts(
      {
        args: [
          '--settings',
          '/state/hooks.json',
          '--disallowedTools=AskUserQuestion',
          '--model',
          'opus',
          '--add-dir',
          '/clone'
        ],
        env: { SLACK_AGENT_CONV: 'C1-2' },
        appendSystemPromptFile: '/state/system.md',
        claudeConfigDir: '/home/me/.claude-logins/backup'
      },
      async (path) => `prompt from ${path}\n`
    )
    expect(parts.extraArgs).toEqual({
      settings: '/state/hooks.json',
      model: 'opus'
    })
    expect(parts.additionalDirectories).toEqual(['/clone'])
    expect(parts.disallowedTools).toEqual(['AskUserQuestion'])
    expect(parts.env).toEqual({ SLACK_AGENT_CONV: 'C1-2' })
    expect(parts.appendSystemPrompt).toBe('prompt from /state/system.md')
    expect(parts.claudeConfigDir).toBe('/home/me/.claude-logins/backup')
  })

  it('refuses flags Orca owns for a chat, but not tool lists', () => {
    expect(claudeChatProfileArgsRefusal(['--dangerously-skip-permissions'])).toContain(
      '--dangerously-skip-permissions'
    )
    expect(claudeChatProfileArgsRefusal(['--resume', 'abc'])).toContain('--resume')
    expect(claudeChatProfileArgsRefusal(['--disallowedTools', 'A', 'B', '--model', 'opus'])).toBe(
      null
    )
  })

  it('reads a tool rule with spaces as one rule', () => {
    expect(splitToolRules('Bash(git log:*), Read  Edit')).toEqual([
      'Bash(git log:*)',
      'Read',
      'Edit'
    ])
  })

  it('refuses short flags it would otherwise drop or misread', () => {
    expect(claudeChatProfileArgsRefusal(['-c'])).toContain('--continue')
    expect(claudeChatProfileArgsRefusal(['-x'])).toContain('short flag')
    expect(claudeChatProfileArgsRefusal(['-m', 'opus'])).toBe(null)
  })

  it('extends a variable from the agent environment', () => {
    expect(
      expandChatProfileEnv({ PATH: '${PATH}:/opt/bot', X: '${MISSING}y' }, { PATH: '/bin' })
    ).toEqual({ PATH: '/bin:/opt/bot', X: 'y' })
  })

  it('pins a non-default login and drops an inherited one', () => {
    const env: Record<string, string> = { CLAUDE_CONFIG_DIR: '/elsewhere' }
    const recipe = claudeChatProfileAccount(env, '/home/me/.claude-logins/backup')
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/me/.claude-logins/backup')
    expect(recipe).toEqual({
      route: 'system',
      home: '/home/me/.claude-logins/backup',
      configDir: '/home/me/.claude-logins/backup'
    })
  })

  it("appends the file after Orca's own instructions", () => {
    expect(
      withProfileSystemPrompt(
        {
          systemPrompt: {
            type: 'preset' as const,
            preset: 'claude_code' as const,
            append: 'bot'
          }
        },
        'slack'
      ).systemPrompt
    ).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'bot\n\nslack'
    })
    expect(withProfileSystemPrompt<{ systemPrompt?: unknown }>({}, 'slack').systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'slack'
    })
  })
})
