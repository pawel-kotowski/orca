import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claudeSubagentsFolder, readClaudeSubagentTranscripts } from './claude-subagent-transcripts'
import { readNativeChatTranscript } from './transcript-reader'
import { mergeClaudeSubagents } from '../../shared/native-chat/transcript/native-chat-claude-subagent-merge'
import { projectNativeChatTranscript } from '../../shared/native-chat/transcript/native-chat-transcript-projection'
import type { NativeChatMessage } from '../../shared/native-chat/native-chat-types'

// Paweł, 2026-11-12, on a terminal Claude chat that started four background subagents in one
// reply: "those subagents dont show up nicely, empty lines". Claude writes each content block of
// one API message as its own transcript line, so the four Agent calls are four rows; the roster
// was keyed by row and drew four unnamed "Ran 1 subagent" rows. These lines follow that
// transcript's shape (trimmed).

const SPAWNS = [
  ['toolu_1', 'a1111', 'Rewind/fork parity survey'],
  ['toolu_2', 'a2222', 'Queue/stop-tasks parity survey'],
  ['toolu_3', 'a3333', 'Worker approvals/strips parity survey'],
  ['toolu_4', 'a4444', 'Usage-limit/clear-fade parity survey']
] as const

function at(seconds: number): string {
  return new Date(Date.UTC(2026, 10, 12, 20, 22, seconds)).toISOString()
}

function jsonl(records: readonly object[]): string {
  return records.map((record) => `${JSON.stringify(record)}\n`).join('')
}

function assistant(uuid: string, seconds: number, content: object[]): object {
  return {
    uuid,
    type: 'assistant',
    isSidechain: false,
    timestamp: at(seconds),
    message: { id: 'msg_reply_1', role: 'assistant', model: 'claude-opus-5-5', content }
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
    assistant('a-text', 2, [{ type: 'text', text: 'Starting four read-only investigators.' }])
  ]
  SPAWNS.forEach(([callId, agentId, description], index) => {
    const seconds = 5 + index * 10
    lines.push(
      assistant(`a-call-${index}`, seconds, [
        {
          type: 'tool_use',
          id: callId,
          name: 'Agent',
          input: { description, subagent_type: 'Explore', run_in_background: true, prompt: '…' }
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
                { type: 'text', text: `Async agent launched successfully.\nagentId: ${agentId}` }
              ]
            }
          ]
        },
        toolUseResult: { isAsync: true, status: 'async_launched', agentId, description }
      }
    )
  })
  // Two of the four have reported back; the other two still run.
  SPAWNS.slice(0, 2).forEach(([callId, agentId], index) => {
    lines.push({
      type: 'attachment',
      uuid: `n-${index}`,
      timestamp: at(50 + index),
      attachment: {
        type: 'queued_command',
        commandMode: 'task-notification',
        prompt: `<task-notification>\n<task-id>${agentId}</task-id>\n<tool-use-id>${callId}</tool-use-id>\n<status>completed</status>\n</task-notification>`
      }
    })
  })
  return lines
}

function subagentLines(agentId: string, description: string, startSeconds: number): object[] {
  const row = (uuid: string, type: 'user' | 'assistant', seconds: number, content: unknown) => ({
    uuid,
    type,
    isSidechain: true,
    agentId,
    timestamp: at(seconds),
    message: { role: type, content }
  })
  return [
    row(`${agentId}-brief`, 'user', startSeconds, `Brief for ${description}`),
    row(`${agentId}-step`, 'assistant', startSeconds + 1, [
      { type: 'tool_use', id: `${agentId}-grep`, name: 'Grep', input: { pattern: 'rewind' } }
    ]),
    row(`${agentId}-step-result`, 'user', startSeconds + 2, [
      { tool_use_id: `${agentId}-grep`, type: 'tool_result', content: 'src/a.ts' }
    ]),
    row(`${agentId}-report`, 'assistant', startSeconds + 3, [
      { type: 'text', text: `Report: ${description}` }
    ])
  ]
}

describe('a terminal Claude chat with parallel background subagents', () => {
  let root: string
  let transcript: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-parallel-subagents-'))
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
    await rm(root, { recursive: true, force: true })
  })

  async function project(): Promise<ReturnType<typeof projectNativeChatTranscript>> {
    const read = await readNativeChatTranscript('claude', 'session-1', { filePath: transcript })
    if (!('messages' in read)) {
      throw new Error(read.error)
    }
    const subagents = await readClaudeSubagentTranscripts(transcript)
    return projectNativeChatTranscript(mergeClaudeSubagents(read.messages, subagents, true))
  }

  it('draws the four spawns of one reply as one run, each named by its description', async () => {
    const { conversation } = await project()
    const rosters = conversation.filter((message) =>
      message.blocks.some((block) => block.type === 'subagent-group')
    )
    expect(rosters).toHaveLength(1)
    const group = rosters[0]!.blocks.find((block) => block.type === 'subagent-group')
    expect(group).toMatchObject({
      agents: [
        { id: 'a1111', label: 'Rewind/fork parity survey', state: 'completed' },
        { id: 'a2222', label: 'Queue/stop-tasks parity survey', state: 'completed' },
        { id: 'a3333', label: 'Worker approvals/strips parity survey', state: 'working' },
        { id: 'a4444', label: 'Usage-limit/clear-fade parity survey', state: 'working' }
      ]
    })
    // The run sits right after the reply that started it, before anything said later.
    const ids = conversation.map((message: NativeChatMessage) => message.id)
    expect(ids.indexOf(rosters[0]!.id)).toBeGreaterThan(ids.indexOf('u-prompt'))
  })

  it("keeps each subagent's own steps and report for its section", async () => {
    const { conversation, subagentRows } = await project()
    for (const [, agentId, description] of SPAWNS) {
      const rows = subagentRows.get(agentId) ?? []
      expect(rows.length).toBeGreaterThan(0)
      const report = rows.at(-1)!.message.blocks.find((block) => block.type === 'text')
      expect(report).toMatchObject({ text: `Report: ${description}` })
      expect(conversation.some((message) => message.agentId === agentId)).toBe(false)
    }
  })
})
