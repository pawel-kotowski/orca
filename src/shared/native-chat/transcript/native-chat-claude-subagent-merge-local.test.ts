import { expect, it } from 'vitest'
import type { NativeChatMessage } from '../native-chat-types'
import type { NativeChatSubagentTranscript } from '../native-chat-subagent-transcripts'
import { mergeClaudeSubagents } from './native-chat-claude-subagent-merge'

// The roster row stands for its spawn: the Agent call and its result leave the conversation, so a
// terminal chat does not draw the same subagents again as a "Ran N agents" tool run.

function row(id: string, blocks: NativeChatMessage['blocks'], at: number): NativeChatMessage {
  return { id, role: 'assistant', blocks, timestamp: at, source: 'transcript' }
}

const subagent: NativeChatSubagentTranscript = {
  agentId: 'agent-x',
  toolUseId: 'call-x',
  parentAgentId: null,
  description: 'Review',
  agentType: 'general-purpose',
  finished: true,
  startedAt: 2_500,
  updatedAt: 4_500,
  messages: [
    {
      id: 'subagent:agent-x:s1',
      role: 'user',
      blocks: [{ type: 'text', text: 'Brief' }],
      timestamp: 2_500,
      source: 'hook',
      agentId: 'agent-x'
    }
  ]
}

it('drops a rostered spawn call and its result, and keeps everything else', () => {
  const merged = mergeClaudeSubagents(
    [
      row(
        'a1',
        [
          { type: 'text', text: 'Starting a reviewer.' },
          { type: 'tool-call', name: 'Agent', callId: 'call-x', input: { description: 'Review' } }
        ],
        2_000
      ),
      row('a2', [{ type: 'tool-call', name: 'Agent', callId: 'call-lost', input: {} }], 2_100),
      {
        ...row('r1', [{ type: 'tool-result', callId: 'call-x', output: 'Done.' }], 3_000),
        role: 'tool'
      }
    ],
    [subagent],
    false
  )
  expect(merged.map((message) => message.id)).toEqual([
    'a1',
    // A spawn with no subagent transcript has no roster row, so its call still draws.
    'a2',
    'subagent-roster:agent-x',
    'subagent:agent-x:s1'
  ])
  expect(merged[0]!.blocks).toEqual([{ type: 'text', text: 'Starting a reviewer.' }])
})
