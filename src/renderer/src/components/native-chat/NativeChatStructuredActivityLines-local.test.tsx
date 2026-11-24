// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NativeChatStructuredActivityLines } from './NativeChatStructuredActivityLines'
import { structuredChatShellCommands } from './native-chat-structured-shell-commands'
import type { WorkerDockRowView } from './tools/tasks/dock/WorkerDockRow'

afterEach(cleanup)

const failed: WorkerDockRowView = {
  kind: 'worker',
  id: 'w1',
  dispatchId: 'd1',
  source: '',
  name: 'migrate-db',
  title: 'Migrate the sessions table',
  model: null,
  state: 'failed',
  changedAt: 1,
  startedAt: 1,
  reason: 'exit 1',
  settlement: 'settled-1',
  resultId: null,
  stoppable: false,
  ownerActionsAvailable: true
}

function lines(overrides: Partial<Parameters<typeof NativeChatStructuredActivityLines>[0]> = {}) {
  const props = {
    paneKey: 'structured-agent-session-s1:leaf',
    readCommands: () => new Map([['b1', 'pnpm dev --host']]),
    tasks: [
      {
        id: 'a1',
        kind: 'agent' as const,
        description: 'Survey the parser',
        state: 'working' as const,
        stoppable: true
      },
      {
        id: 'b1',
        kind: 'command' as const,
        description: 'Dev server',
        state: 'working' as const,
        stoppable: true
      }
    ],
    settledTasks: [],
    supportsTaskStop: true,
    offersStopAll: false,
    stoppingTaskIds: new Set<string>(),
    stoppingAll: false,
    indicatorActive: false,
    isVisible: true,
    expanded: false,
    onExpandedChange: vi.fn(),
    onStop: vi.fn(),
    onShowAgent: vi.fn(),
    ...overrides
  }
  render(<NativeChatStructuredActivityLines {...props} />)
  return props
}

it('names every subagent and shell without a click, opens one and stops only the one pressed', () => {
  const props = lines()
  expect(document.querySelector('[data-native-chat-activity-line=subagents]')).toHaveTextContent(
    'Survey the parser'
  )
  expect(screen.getByTitle(/Dev server\s+pnpm dev --host/)).toBeInTheDocument()
  fireEvent.click(screen.getByTitle('Survey the parser'))
  expect(props.onShowAgent).toHaveBeenCalledWith('a1')
  fireEvent.click(screen.getByRole('button', { name: 'Stop Dev server' }))
  expect(props.onStop).toHaveBeenCalledExactlyOnceWith('b1')
})

it('keeps a failed worker on its line until it is cleared', () => {
  const onWorkerAction = vi.fn()
  lines({ tasks: [], workerRows: new Map([['w1', failed]]), onWorkerAction })
  expect(document.querySelector('[data-native-chat-activity-line=workers]')).toHaveTextContent(
    'migrate-dbexit 1'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Clear migrate-db' }))
  expect(onWorkerAction).toHaveBeenCalledWith(failed, 'clear')
})

it('reads a background shell and its full command from the chat, by the id the roster names', () => {
  const commands = structuredChatShellCommands([
    {
      id: 'm1',
      role: 'assistant',
      timestamp: 1_000,
      source: 'transcript',
      blocks: [
        {
          type: 'tool-call',
          name: 'Bash',
          callId: 'c1',
          input: { command: 'pnpm dev', description: 'Dev server', run_in_background: true }
        }
      ]
    },
    {
      id: 'm2',
      role: 'tool',
      timestamp: 1_001,
      source: 'transcript',
      blocks: [
        { type: 'tool-result', callId: 'c1', output: 'Command running in background with ID: b1' }
      ]
    }
  ])
  expect(commands.get('b1')).toBe('pnpm dev')
})
