import { describe, expect, it } from 'vitest'
import { launchAgentFromCommand } from './command-launch-agent'

describe('the agent a startup command launches', () => {
  it.each([
    ['claude', 'claude'],
    ["~/.agents/bin/claude-as personal --model opus 'brief'", 'claude'],
    ['FOO=1 exec claude --resume x', 'claude'],
    ['codex --yolo', 'codex']
  ])('%s → %s', (command, agent) => {
    expect(launchAgentFromCommand(command)).toBe(agent)
  })

  it.each(['zsh', 'npm run dev', 'echo claude', 'claude-code-guide', undefined])(
    'leaves %s a terminal',
    (command) => {
      expect(launchAgentFromCommand(command)).toBeUndefined()
    }
  )
})
