// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatSubagentTranscript } from '../../../../shared/native-chat/native-chat-subagent-transcripts'
import { NativeChatTerminalShellsStatus } from './NativeChatTerminalShellsStatus'
import { publishNativeChatClaudeSubagents } from './native-chat-claude-subagents-store'
import { terminalChatBackgroundTasks } from './native-chat-terminal-background-tasks'
import type { NativeChatMessageListHandle } from './messages/actions/use-native-chat-reveal-latest'

vi.mock('./NativeChatWorkersStrip', () => ({ NativeChatWorkersStrip: () => null }))

const PANE = 'tab-1:leaf-1'

function row(id: string, role: NativeChatMessage['role'], blocks: NativeChatMessage['blocks']) {
  return { id, role, blocks, timestamp: 1_000, source: 'transcript' as const }
}

// One reply that started two background subagents and a background shell.
const messages: NativeChatMessage[] = [
  row('u1', 'user', [{ type: 'text', text: 'Survey both' }]),
  row('a1', 'assistant', [
    { type: 'tool-call', name: 'Agent', callId: 'c1', input: { description: 'Rewind survey' } }
  ]),
  row('r1', 'tool', [
    { type: 'tool-result', callId: 'c1', output: 'Async agent launched successfully.' }
  ]),
  row('a2', 'assistant', [
    { type: 'tool-call', name: 'Agent', callId: 'c2', input: { description: 'Queue survey' } }
  ]),
  row('r2', 'tool', [
    { type: 'tool-result', callId: 'c2', output: 'Async agent launched successfully.' }
  ]),
  row('a3', 'assistant', [
    {
      type: 'tool-call',
      name: 'Bash',
      callId: 'c3',
      input: { command: 'pnpm dev', description: 'Dev server', run_in_background: true }
    }
  ]),
  row('r3', 'tool', [
    { type: 'tool-result', callId: 'c3', output: 'Command running in background with ID: b1' }
  ])
]

function subagent(agentId: string, toolUseId: string, description: string) {
  return {
    agentId,
    toolUseId,
    parentAgentId: null,
    description,
    agentType: 'Explore',
    finished: null,
    startedAt: 1_100,
    updatedAt: 1_200,
    messages: []
  } satisfies NativeChatSubagentTranscript
}

const subagents = [subagent('ag1', 'c1', 'Rewind survey'), subagent('ag2', 'c2', 'Queue survey')]

describe('terminalChatBackgroundTasks', () => {
  it('lists running subagents by description beside the shells, none stoppable', () => {
    const tasks = terminalChatBackgroundTasks(messages, subagents, true, 2_000)
    expect(tasks).toEqual([
      expect.objectContaining({ id: 'ag1', kind: 'agent', description: 'Rewind survey' }),
      expect.objectContaining({ id: 'ag2', kind: 'agent', description: 'Queue survey' }),
      expect.objectContaining({
        id: 'b1',
        kind: 'command',
        description: 'Dev server',
        command: 'pnpm dev'
      })
    ])
    expect(tasks.every((task) => task.stoppable === false)).toBe(true)
  })

  it('lists nothing once Claude no longer runs in the pane', () => {
    expect(terminalChatBackgroundTasks(messages, subagents, false, 2_000)).toEqual([])
  })
})

describe('NativeChatTerminalShellsStatus', () => {
  beforeEach(() => {
    useAppStore.setState({
      agentStatusByPaneKey: { [PANE]: { agentType: 'claude', state: 'working' } } as never
    })
  })
  afterEach(() => {
    cleanup()
    act(() => publishNativeChatClaudeSubagents(PANE, []))
  })

  it('names every running subagent and shell on its own line, no click needed, no Stop', () => {
    const revealSubagent = vi.fn()
    const messageListRef = {
      current: { revealSubagent } as unknown as NativeChatMessageListHandle
    }
    act(() => publishNativeChatClaudeSubagents(PANE, subagents))
    const { container } = render(
      <NativeChatTerminalShellsStatus
        session={{ messages }}
        paneKey={PANE}
        isVisible
        messageListRef={messageListRef}
      />
    )
    const agentsLine = container.querySelector('[data-native-chat-activity-line="subagents"]')
    const shellsLine = container.querySelector('[data-native-chat-activity-line="shells"]')
    expect(agentsLine).toHaveTextContent('Rewind survey')
    expect(agentsLine).toHaveTextContent('Queue survey')
    expect(shellsLine).toHaveTextContent('Dev server')
    expect(shellsLine?.querySelector('[title]')?.getAttribute('title')).toBe('Dev server\npnpm dev')
    fireEvent.click(screen.getByRole('button', { name: /Queue survey/ }))
    expect(revealSubagent).toHaveBeenCalledWith('ag2')
    expect(screen.queryByRole('button', { name: /^Stop/ })).toBeNull()
  })

  it('draws nothing but its frame while nothing runs', () => {
    useAppStore.setState({ agentStatusByPaneKey: {} as never })
    const { container } = render(
      <NativeChatTerminalShellsStatus session={{ messages }} paneKey={PANE} isVisible />
    )
    expect(container.querySelector('[data-native-chat-activity-line]')).toBeNull()
  })
})
