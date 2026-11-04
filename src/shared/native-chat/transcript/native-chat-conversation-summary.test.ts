import { describe, expect, it } from 'vitest'
import type { NativeChatMessage } from '../native-chat-types'
import { summarizeNativeChatConversation } from './native-chat-conversation-summary'

function user(id: string, text: string): NativeChatMessage {
  return { id, role: 'user', blocks: [{ type: 'text', text }], timestamp: 1, source: 'transcript' }
}

function agent(id: string, blocks: NativeChatMessage['blocks']): NativeChatMessage {
  return { id, role: 'assistant', blocks, timestamp: 1, source: 'transcript' }
}

const bash = (description: string, command: string) =>
  ({
    type: 'tool-call',
    name: 'Bash',
    input: { command, description },
    state: 'completed'
  }) as const

const conversation: NativeChatMessage[] = [
  user('u1', 'plan the coaching reach'),
  agent('a1', [{ type: 'text', text: 'Here is the plan.' }]),
  user('u2', 'do it all'),
  agent('a2', [{ type: 'text', text: 'Checking the open PRs first.' }]),
  agent('a3', [bash('List open PRs', 'gh pr list'), bash('Ship PR 4361', 'bash ship-pr.sh 4361')]),
  agent('a4', [{ type: 'text', text: 'All shipped: PR 4361 merged.' }])
]

describe('summarizeNativeChatConversation', () => {
  it('names the first and last prompt, the latest steps, and the answer once done', () => {
    expect(
      summarizeNativeChatConversation(conversation, { working: false, startsAtFirstMessage: true })
    ).toEqual({
      firstPrompt: 'plan the coaching reach',
      lastPrompt: 'do it all',
      steps: [{ kind: 'said', text: 'Checking the open PRs first.' }],
      finalAnswer: 'All shipped: PR 4361 merged.'
    })
  })

  it('keeps the latest words as a step while the agent still works', () => {
    const summary = summarizeNativeChatConversation(conversation, {
      working: true,
      startsAtFirstMessage: true
    })
    expect(summary.finalAnswer).toBeNull()
    expect(summary.steps.at(-1)).toEqual({ kind: 'said', text: 'All shipped: PR 4361 merged.' })
  })

  it('leaves the first prompt unknown when the loaded window starts later', () => {
    expect(
      summarizeNativeChatConversation(conversation, { working: false, startsAtFirstMessage: false })
        .firstPrompt
    ).toBeNull()
  })

  it('skips harness messages written as the user', () => {
    const summary = summarizeNativeChatConversation(
      [...conversation, user('n1', '<task-notification> <task-id>b1</task-id> done')],
      { working: true, startsAtFirstMessage: true }
    )
    expect(summary.lastPrompt).toBe('do it all')
  })
})
