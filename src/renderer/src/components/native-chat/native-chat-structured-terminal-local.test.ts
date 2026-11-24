import { expect, it } from 'vitest'
import {
  structuredChatTerminalPane,
  structuredTerminalSwitch
} from './native-chat-structured-terminal-state'

const CHAT = 'structured-agent-session-s1:leaf'

function state(panes: Record<string, string>, tabs: string[]) {
  return {
    agentStatusByPaneKey: new Map(
      Object.entries(panes).map(([key, id]) => [
        key,
        { providerSession: { key: 'session_id', id } }
      ])
    ),
    tabsByWorktree: { w: tabs.map((id) => ({ id })) }
  } as never
}

it('finds the terminal that runs the same conversation, and only in this workspace', () => {
  expect(
    structuredChatTerminalPane(state({ [CHAT]: 'c', 't1:leaf': 'other' }, ['t1']), CHAT, 'w')
  ).toBeNull()
  expect(
    structuredChatTerminalPane(state({ [CHAT]: 'c', 't1:leaf': 'c' }, ['t1']), CHAT, 'w')
  ).toBe('t1:leaf')
  // A closed tab's row that lingers is no writer.
  expect(
    structuredChatTerminalPane(state({ [CHAT]: 'c', 't1:leaf': 'c' }, []), CHAT, 'w')
  ).toBeNull()
})

it('moves a plain chat, copies a bot and an agent whose copy its host makes, offers neither elsewhere', () => {
  const scope = { worktreeId: 'w', botName: null }
  expect(structuredTerminalSwitch({ ...scope, agent: 'claude' })).toBe('same')
  expect(structuredTerminalSwitch({ ...scope, agent: 'codex' })).toBe('same')
  expect(structuredTerminalSwitch({ ...scope, agent: 'claude', botName: 'Bot' })).toBe('copy')
  expect(structuredTerminalSwitch({ ...scope, agent: 'opencode2' })).not.toBe('same')
  expect(structuredTerminalSwitch({ ...scope, agent: 'claude', worktreeId: null })).toBeNull()
})
