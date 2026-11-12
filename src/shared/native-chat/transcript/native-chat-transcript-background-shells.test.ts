import { describe, expect, it } from 'vitest'
import type { NativeChatBlock, NativeChatMessage } from '../native-chat-types'
import { runningTranscriptBackgroundShells } from './native-chat-transcript-background-shells'

let seq = 0
function message(
  role: 'user' | 'assistant',
  blocks: NativeChatBlock[],
  at = 1_000
): NativeChatMessage {
  seq += 1
  return { id: `m${seq}`, role, blocks, timestamp: at, source: 'transcript' } as NativeChatMessage
}
const call = (callId: string, name: string, input: unknown): NativeChatBlock =>
  ({ type: 'tool-call', name, input, callId }) as NativeChatBlock
const result = (callId: string, output: string, isError = false): NativeChatBlock =>
  ({ type: 'tool-result', output, callId, ...(isError ? { isError } : {}) }) as NativeChatBlock
const text = (value: string): NativeChatBlock => ({ type: 'text', text: value }) as NativeChatBlock

function notification(taskId: string, callId: string, status: string | null): NativeChatMessage {
  return message('user', [
    text(
      `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>${callId}</tool-use-id>\n${status ? `<status>${status}</status>\n` : ''}<summary>x</summary>\n</task-notification>`
    )
  ])
}

describe('running shells from a Claude transcript', () => {
  const started = [
    message('assistant', [
      call('c1', 'Bash', {
        command: 'pnpm dev',
        description: 'Start dev server',
        run_in_background: true
      })
    ]),
    message('user', [
      result(
        'c1',
        'Command running in background with ID: b1. Output is being written to: /tmp/b1.output'
      )
    ])
  ]

  it('lists a background Bash shell until its notification', () => {
    expect(runningTranscriptBackgroundShells(started, 2_000)).toEqual([
      {
        id: 'b1',
        kind: 'command',
        description: 'Start dev server',
        command: 'pnpm dev',
        state: 'working',
        startedAt: 1_000,
        stoppable: false
      }
    ])
    expect(
      runningTranscriptBackgroundShells([...started, notification('b1', 'c1', 'completed')], 2_000)
    ).toEqual([])
  })

  it('ends a shell that TaskStop names', () => {
    const stopped = [...started, message('assistant', [call('c2', 'TaskStop', { task_id: 'b1' })])]
    expect(runningTranscriptBackgroundShells(stopped, 2_000)).toEqual([])
  })

  it('ignores foreground Bash and failed starts', () => {
    const messages = [
      message('assistant', [call('c3', 'Bash', { command: 'ls' })]),
      message('user', [result('c3', 'a\nb')]),
      message('assistant', [call('c4', 'Bash', { command: 'x', run_in_background: true })]),
      message('user', [result('c4', 'denied', true)])
    ]
    expect(runningTranscriptBackgroundShells(messages, 2_000)).toEqual([])
  })

  it('keeps a Monitor through its events and drops it at its timeout', () => {
    const messages = [
      message('assistant', [
        call('c5', 'Monitor', {
          command: 'tail -f log',
          description: 'errors in log',
          timeout_ms: 60_000
        })
      ]),
      message('user', [
        result(
          'c5',
          'Monitor started (task m1, timeout 60000ms). You will be notified on each event.'
        )
      ]),
      notification('m1', 'c5', null)
    ]
    expect(
      runningTranscriptBackgroundShells(messages, 30_000).map((task) => [
        task.id,
        task.kind,
        task.state
      ])
    ).toEqual([['m1', 'monitor', 'monitoring']])
    expect(runningTranscriptBackgroundShells(messages, 61_001)).toEqual([])
  })
})
