import { expect, it } from 'vitest'
import { structuredTerminalSwitch } from './native-chat-structured-terminal-state'

it('moves a plain chat, copies a bot and an agent whose copy its host makes, offers neither elsewhere', () => {
  const scope = { worktreeId: 'w', botName: null }
  expect(structuredTerminalSwitch({ ...scope, agent: 'claude' })).toBe('same')
  expect(structuredTerminalSwitch({ ...scope, agent: 'codex' })).toBe('same')
  expect(structuredTerminalSwitch({ ...scope, agent: 'claude', botName: 'Bot' })).toBe('copy')
  expect(structuredTerminalSwitch({ ...scope, agent: 'opencode2' })).not.toBe('same')
  expect(structuredTerminalSwitch({ ...scope, agent: 'claude', worktreeId: null })).toBeNull()
})
