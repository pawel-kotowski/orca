import { describe, expect, it } from 'vitest'
import { nextChatLaunchProfile } from './structured-agent-session-chat-control'

describe('orca chat profile and login', () => {
  const current = { args: ['--settings', '/s.json'], claudeConfigDir: '/l/main' }

  it('login changes the login only; profile replaces the whole profile', () => {
    expect(nextChatLaunchProfile(current, { claudeConfigDir: '/l/backup' })).toEqual({
      args: ['--settings', '/s.json'],
      claudeConfigDir: '/l/backup'
    })
    expect(
      nextChatLaunchProfile(current, { profile: { appendSystemPromptFile: '/p.md' } })
    ).toEqual({ appendSystemPromptFile: '/p.md' })
  })

  it('refuses arguments Orca owns', () => {
    expect(() => nextChatLaunchProfile(null, { profile: { args: ['-r', 'abc'] } })).toThrow(
      /--resume/
    )
  })
})
