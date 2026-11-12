// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { render } from '../messages/actions/native-chat-tooltip-test-harness'
import type { NativeChatMessage } from '../../../../../shared/native-chat/native-chat-types'
import type { NativeChatSubagentTranscript } from '../../../../../shared/native-chat/native-chat-subagent-transcripts'
import { mergeClaudeSubagents } from '../../../../../shared/native-chat/transcript/native-chat-claude-subagent-merge'
import { NativeChatMessageList } from '../NativeChatMessageList'
import { installNativeChatMessageListTestViewport } from '../viewport/virtualization/native-chat-message-list-test-viewport'
import type { NativeChatLiveSession } from '../session/terminal/read/native-chat-live-session-contract'

// A terminal Claude chat as its transcript decodes: one reply's four background Agent calls are
// four rows (Claude writes one line per content block), each followed by its launch result.
// Paweł, 2026-11-12: they drew as four unnamed "Kicked off 1 subagent" rows with gaps between.

const DESCRIPTIONS = ['Rewind survey', 'Queue survey', 'Approvals survey', 'Limits survey']
let order = 0

function row(
  id: string,
  role: NativeChatMessage['role'],
  blocks: NativeChatMessage['blocks'],
  at: number
): NativeChatMessage {
  order += 1
  return { id, role, blocks, timestamp: at, source: 'transcript', transcriptOrder: order }
}

const conversation: NativeChatMessage[] = [
  row('prompt', 'user', [{ type: 'text', text: 'Survey the four gaps' }], 1_000),
  row('lead', 'assistant', [{ type: 'text', text: 'Starting four investigators.' }], 2_000),
  ...DESCRIPTIONS.flatMap((description, index) => [
    row(
      `call-row-${index}`,
      'assistant',
      [
        {
          type: 'tool-call',
          name: 'Agent',
          callId: `call-${index}`,
          input: { description, run_in_background: true }
        }
      ],
      3_000 + index * 1_000
    ),
    row(
      `result-row-${index}`,
      'tool',
      [
        {
          type: 'tool-result',
          callId: `call-${index}`,
          output: 'Async agent launched successfully.'
        }
      ],
      3_100 + index * 1_000
    )
  ])
]

function subagent(description: string, index: number): NativeChatSubagentTranscript {
  const agentId = `agent-${index}`
  const own = (id: string, role: NativeChatMessage['role'], text: string, at: number) => ({
    id: `subagent:${agentId}:${id}`,
    role,
    blocks: [{ type: 'text' as const, text }],
    timestamp: at,
    source: 'hook' as const,
    agentId
  })
  return {
    agentId,
    toolUseId: `call-${index}`,
    parentAgentId: null,
    description,
    agentType: 'Explore',
    finished: null,
    startedAt: 3_050 + index * 1_000,
    updatedAt: 9_000,
    messages: [
      own('brief', 'user', `Brief: ${description}`, 3_050 + index * 1_000),
      own('report', 'assistant', `Report: ${description}`, 9_000 + index)
    ]
  }
}

function session(messages: NativeChatMessage[]): NativeChatLiveSession {
  return {
    messages,
    status: 'working',
    sessionId: 'session-1',
    agent: 'claude',
    hasMore: false,
    loadingEarlier: false,
    olderHistoryGeneration: 0,
    loadEarlier: vi.fn(),
    readPhase: 'ready'
  }
}

let restoreViewport = (): void => {}
beforeAll(() => {
  restoreViewport = installNativeChatMessageListTestViewport()
})
afterAll(() => restoreViewport())
afterEach(cleanup)

it("draws one reply's parallel subagents as one run that opens to each one's steps", () => {
  const merged = mergeClaudeSubagents(conversation, DESCRIPTIONS.map(subagent), true)
  render(<NativeChatMessageList session={session(merged)} isWorking expandSignal={false} />)
  expect(screen.getAllByText(/Kicked off \d+ subagents?/)).toHaveLength(1)
  expect(screen.getByText('Kicked off 4 subagents')).toBeInTheDocument()
  const run = screen.getByRole('button', { name: /Kicked off 4 subagents/ })
  if (run.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(run)
  }
  for (const description of DESCRIPTIONS) {
    expect(screen.getByText(description)).toBeInTheDocument()
  }
  const entry = screen.getByText('Queue survey').closest('button')!
  if (entry.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(entry)
  }
  expect(screen.getByText('Report: Queue survey')).toBeInTheDocument()
})
