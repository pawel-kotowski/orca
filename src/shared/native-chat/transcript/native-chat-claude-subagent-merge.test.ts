import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../native-chat-types'
import type { NativeChatSubagentTranscript } from '../native-chat-subagent-transcripts'
import { mergeClaudeSubagents } from './native-chat-claude-subagent-merge'
import { projectNativeChatTranscript } from './native-chat-transcript-projection'

function row(
  id: string,
  role: NativeChatMessage['role'],
  blocks: NativeChatMessage['blocks'],
  order: number
): NativeChatMessage {
  return { id, role, blocks, timestamp: order * 1000, source: 'transcript', transcriptOrder: order }
}

const conversation: NativeChatMessage[] = [
  row('u1', 'user', [{ type: 'text', text: 'Review the code' }], 1),
  row(
    'a1',
    'assistant',
    [
      { type: 'text', text: 'Starting a reviewer.' },
      { type: 'tool-call', name: 'Agent', callId: 'call-1', input: { description: 'Review' } }
    ],
    2
  ),
  row('r1', 'tool', [{ type: 'tool-result', callId: 'call-1', output: 'Found two bugs.' }], 5),
  row('a2', 'assistant', [{ type: 'text', text: 'The reviewer found two bugs.' }], 6)
]

function subagent(
  overrides: Partial<NativeChatSubagentTranscript> = {}
): NativeChatSubagentTranscript {
  return {
    agentId: 'agent-x',
    toolUseId: 'call-1',
    parentAgentId: null,
    description: 'Review',
    agentType: 'general-purpose',
    finished: true,
    startedAt: 2500,
    updatedAt: 4500,
    messages: [
      {
        id: 'subagent:agent-x:s1',
        role: 'user',
        blocks: [{ type: 'text', text: 'You are a reviewer.' }],
        timestamp: 2500,
        source: 'hook',
        agentId: 'agent-x'
      },
      {
        id: 'subagent:agent-x:s2',
        role: 'assistant',
        blocks: [{ type: 'text', text: 'Two bugs.' }],
        timestamp: 4500,
        source: 'hook',
        agentId: 'agent-x'
      }
    ],
    ...overrides
  }
}

describe('mergeClaudeSubagents', () => {
  it('leaves a conversation without subagents as it is', () => {
    expect(mergeClaudeSubagents(conversation, [], true)).toBe(conversation)
  })

  it('draws a roster at the spawn and keeps the subagent rows apart', () => {
    const merged = mergeClaudeSubagents(conversation, [subagent()], true)
    const { conversation: rows, subagentRows } = projectNativeChatTranscript(merged)
    const roster = rows.find((message) =>
      message.blocks.some((block) => block.type === 'subagent-group')
    )
    expect(roster).toBeDefined()
    const group = roster!.blocks.find((block) => block.type === 'subagent-group')
    expect(group).toMatchObject({
      agents: [{ id: 'agent-x', label: 'Review', state: 'completed' }]
    })
    // The roster sits after the spawning reply and before the next answer.
    const ids = rows.map((message) => message.id)
    expect(ids.indexOf(roster!.id)).toBeGreaterThan(ids.indexOf('u1'))
    expect(ids.indexOf(roster!.id)).toBeLessThan(ids.indexOf('a2'))
    expect(subagentRows.get('agent-x')?.map((entry) => entry.message.id)).toEqual([
      'subagent:agent-x:s1',
      'subagent:agent-x:s2'
    ])
    // No subagent row leaks into the conversation.
    expect(rows.some((message) => message.agentId === 'agent-x')).toBe(false)
  })

  it('shows a running foreground subagent as working while the session is live', () => {
    const running = conversation.filter((message) => message.id !== 'r1' && message.id !== 'a2')
    const merged = mergeClaudeSubagents(running, [subagent({ finished: null })], true)
    const roster = merged.find((message) => message.id === 'subagent-roster:agent-x')
    expect(roster?.blocks[1]).toMatchObject({ type: 'subagent', state: 'working' })
    const stale = mergeClaudeSubagents(running, [subagent({ finished: null })], false)
    expect(stale.find((m) => m.id === 'subagent-roster:agent-x')?.blocks[1]).toMatchObject({
      state: 'unverifiable'
    })
  })

  it('keeps a background subagent working until its notification arrives', () => {
    const launched = conversation.map((message) =>
      message.id === 'r1'
        ? {
            ...message,
            blocks: [
              {
                type: 'tool-result' as const,
                callId: 'call-1',
                output: 'Async agent launched successfully.'
              }
            ]
          }
        : message
    )
    const running = mergeClaudeSubagents(launched, [subagent({ finished: null })], true)
    expect(running.find((m) => m.id === 'subagent-roster:agent-x')?.blocks[1]).toMatchObject({
      state: 'working'
    })
    const notified = [
      ...launched,
      row(
        'n1',
        'user',
        [
          {
            type: 'text',
            text: '<task-notification><task-id>agent-x</task-id><status>completed</status></task-notification>'
          }
        ],
        7
      )
    ]
    const done = mergeClaudeSubagents(notified, [subagent({ finished: null })], true)
    expect(done.find((m) => m.id === 'subagent-roster:agent-x')?.blocks[1]).toMatchObject({
      state: 'completed'
    })
  })
})
