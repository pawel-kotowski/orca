// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { render } from '../messages/actions/native-chat-tooltip-test-harness'
import {
  claudeSubagentsFolder,
  readClaudeSubagentTranscripts
} from '../../../../../main/native-chat/claude-subagent-transcripts'
import { readNativeChatTranscript } from '../../../../../main/native-chat/transcript-reader'
import { mergeClaudeSubagents } from '../../../../../shared/native-chat/transcript/native-chat-claude-subagent-merge'
import { NativeChatMessageList } from '../NativeChatMessageList'
import { installNativeChatMessageListTestViewport } from '../viewport/virtualization/native-chat-message-list-test-viewport'
import type { NativeChatLiveSession } from '../session/terminal/read/native-chat-live-session-contract'

// Paweł, 2026-11-12: in a terminal Claude chat, one reply's four background Agent calls drew as a
// "Ran 4 agents" run and, beside it, the "Kicked off 4 subagents" roster: the same subagents twice.
// The lines follow that session's transcript (trimmed): a thinking line, then each Agent call as its
// own line with its launch result, and each subagent's own transcript with its meta file.

const SPAWNS = [
  ['toolu_01T1', 'a1111', 'Rewind/fork parity survey'],
  ['toolu_01Sd', 'a2222', 'Queue/stop-tasks parity survey'],
  ['toolu_01UB', 'a3333', 'Worker approvals/strips parity survey'],
  ['toolu_01Pw', 'a4444', 'Usage-limit/clear-fade parity survey']
] as const

const at = (seconds: number): string =>
  new Date(Date.UTC(2026, 10, 12, 20, 22, seconds)).toISOString()

const jsonl = (records: readonly object[]): string =>
  records.map((record) => `${JSON.stringify(record)}\n`).join('')

function assistant(uuid: string, seconds: number, content: object[]): object {
  return {
    uuid,
    type: 'assistant',
    isSidechain: false,
    timestamp: at(seconds),
    message: {
      id: 'msg_011Cgyf5',
      type: 'message',
      role: 'assistant',
      model: 'claude-opus-5-5',
      content
    }
  }
}

function sessionLines(): object[] {
  const lines: object[] = [
    {
      uuid: 'u-prompt',
      type: 'user',
      timestamp: at(0),
      message: { role: 'user', content: 'Survey the four parity gaps in parallel' }
    },
    assistant('a-thinking', 2, [{ type: 'thinking', thinking: '', signature: 'sig' }])
  ]
  SPAWNS.forEach(([callId, agentId, description], index) => {
    const seconds = 5 + index * 10
    lines.push(
      assistant(`a-call-${index}`, seconds, [
        {
          type: 'tool_use',
          id: callId,
          name: 'Agent',
          input: {
            description,
            subagent_type: 'Explore',
            run_in_background: true,
            prompt: `Read-only investigation: ${description}`
          }
        }
      ]),
      { type: 'attachment', uuid: `att-${index}`, timestamp: at(seconds), attachment: {} },
      {
        uuid: `r-${index}`,
        type: 'user',
        timestamp: at(seconds + 1),
        message: {
          role: 'user',
          content: [
            {
              tool_use_id: callId,
              type: 'tool_result',
              content: [
                {
                  type: 'text',
                  text: `Async agent launched successfully. (This tool result only says it started.)\nagentId: ${agentId}`
                }
              ]
            }
          ]
        },
        toolUseResult: { isAsync: true, status: 'async_launched', agentId, description }
      }
    )
  })
  return lines
}

function subagentLines(agentId: string, description: string, start: number): object[] {
  const row = (uuid: string, type: 'user' | 'assistant', seconds: number, content: unknown) => ({
    uuid,
    type,
    isSidechain: true,
    agentId,
    timestamp: at(seconds),
    message: { role: type, content }
  })
  return [
    row(`${agentId}-brief`, 'user', start, `Read-only investigation: ${description}`),
    row(`${agentId}-step`, 'assistant', start + 1, [
      { type: 'tool_use', id: `${agentId}-grep`, name: 'Grep', input: { pattern: 'rewind' } }
    ]),
    row(`${agentId}-step-result`, 'user', start + 2, [
      { tool_use_id: `${agentId}-grep`, type: 'tool_result', content: 'src/a.ts' }
    ]),
    row(`${agentId}-report`, 'assistant', start + 3, [
      { type: 'text', text: `Report: ${description}` }
    ])
  ]
}

function session(messages: NativeChatLiveSession['messages']): NativeChatLiveSession {
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

let root: string
let transcript: string
let restoreViewport = (): void => {}
beforeAll(() => {
  restoreViewport = installNativeChatMessageListTestViewport()
})
afterAll(() => restoreViewport())
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-subagent-spawn-run-'))
  transcript = join(root, 'session-1.jsonl')
  await writeFile(transcript, jsonl(sessionLines()))
  const folder = claudeSubagentsFolder(transcript)!
  await mkdir(folder, { recursive: true })
  for (const [index, [callId, agentId, description]] of SPAWNS.entries()) {
    await writeFile(
      join(folder, `agent-${agentId}.jsonl`),
      jsonl(subagentLines(agentId, description, 6 + index * 10))
    )
    await writeFile(
      join(folder, `agent-${agentId}.meta.json`),
      JSON.stringify({ agentType: 'Explore', description, toolUseId: callId })
    )
  }
})
afterEach(async () => {
  cleanup()
  await rm(root, { recursive: true, force: true })
})

it("draws one reply's background Agent calls as one subagent run, not also as a tool run", async () => {
  const subagents = await readClaudeSubagentTranscripts(transcript)
  const read = await readNativeChatTranscript('claude', 'session-1', { filePath: transcript })
  if (!('messages' in read)) {
    throw new Error(read.error)
  }
  const merged = mergeClaudeSubagents(read.messages, subagents, true)
  render(<NativeChatMessageList session={session(merged)} isWorking expandSignal={false} />)

  // One visible group, and no tool run of the same calls beside it.
  expect(screen.getAllByText(/(Kicked off|Ran) \d+ subagents?/)).toHaveLength(1)
  expect(screen.queryByText(/\b(Running|Ran) \d+ agents?\b/)).not.toBeInTheDocument()
  expect(screen.queryByText(/^Agent\b/)).not.toBeInTheDocument()
  const run = screen.getByRole('button', { name: /Kicked off 4 subagents/ })
  if (run.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(run)
  }
  for (const [, , description] of SPAWNS) {
    expect(screen.getAllByText(description)).toHaveLength(1)
  }
  const entry = screen.getByText('Queue/stop-tasks parity survey').closest('button')!
  if (entry.getAttribute('aria-expanded') !== 'true') {
    fireEvent.click(entry)
  }
  expect(screen.getByText('Report: Queue/stop-tasks parity survey')).toBeInTheDocument()
  // The calls' rows leave no empty slot behind: every drawn row has something in it.
  for (const slot of document.querySelectorAll('[data-index]')) {
    expect(slot.textContent?.trim()).not.toBe('')
  }
})
