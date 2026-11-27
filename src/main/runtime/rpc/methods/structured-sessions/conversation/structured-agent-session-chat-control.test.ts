import { describe, expect, it } from 'vitest'
import { chatTurnRunning, nextChatLaunchProfile } from './structured-agent-session-chat-control'

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

  it('stop sees a turn still starting as running', async () => {
    const turn = (starting: boolean, open: boolean, working: boolean) => ({
      starting: () => starting,
      open: () => open,
      working: async () => working
    })
    expect(await chatTurnRunning(turn(true, false, false))).toBe(true)
    expect(await chatTurnRunning(turn(false, true, false))).toBe(true)
    expect(await chatTurnRunning(turn(false, false, true))).toBe(true)
    expect(await chatTurnRunning(turn(false, false, false))).toBe(false)
  })
})
