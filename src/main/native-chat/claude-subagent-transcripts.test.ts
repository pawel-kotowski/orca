import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { claudeSubagentsFolder, readClaudeSubagentTranscripts } from './claude-subagent-transcripts'

function line(uuid: string, type: 'user' | 'assistant', text: string, at: string): string {
  return `${JSON.stringify({
    uuid,
    type,
    isSidechain: true,
    agentId: 'abc123',
    timestamp: at,
    message: { role: type, content: [{ type: 'text', text }] }
  })}\n`
}

describe('readClaudeSubagentTranscripts', () => {
  let root: string
  let transcript: string
  let folder: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'orca-subagents-'))
    transcript = join(root, 'session-1.jsonl')
    folder = claudeSubagentsFolder(transcript)!
    await mkdir(folder, { recursive: true })
    await writeFile(transcript, '')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('names the folder beside the session transcript', () => {
    expect(folder).toBe(join(root, 'session-1', 'subagents'))
  })

  it('reads each subagent with its meta and tags its rows', async () => {
    await writeFile(
      join(folder, 'agent-abc123.meta.json'),
      JSON.stringify({ toolUseId: 'toolu_1', description: 'Review', agentType: 'general-purpose' })
    )
    await writeFile(
      join(folder, 'agent-abc123.jsonl'),
      line('u1', 'user', 'Brief', '2026-11-10T10:00:00.000Z') +
        line('a1', 'assistant', 'Working on it', '2026-11-10T10:00:05.000Z')
    )
    const [agent] = await readClaudeSubagentTranscripts(transcript)
    expect(agent).toMatchObject({
      agentId: 'abc123',
      toolUseId: 'toolu_1',
      description: 'Review',
      finished: null
    })
    expect(agent!.messages.map((message) => [message.id, message.agentId, message.source])).toEqual(
      [
        ['subagent:abc123:u1', 'abc123', 'hook'],
        ['subagent:abc123:a1', 'abc123', 'hook']
      ]
    )
    expect(agent!.messages[0]!.transcriptOrder).toBeUndefined()
  })

  it('reads on from where it stopped, holding a half-written line until it ends', async () => {
    const file = join(folder, 'agent-abc123.jsonl')
    const second = line('a1', 'assistant', 'Done', '2026-11-10T10:00:09.000Z')
    await writeFile(file, line('u1', 'user', 'Brief', '2026-11-10T10:00:00.000Z'))
    await appendFile(file, second.slice(0, 20))
    expect((await readClaudeSubagentTranscripts(transcript))[0]!.messages).toHaveLength(1)
    await appendFile(file, second.slice(20))
    await writeFile(join(folder, 'agent-abc123.meta.json'), JSON.stringify({ finished: true }))
    const [agent] = await readClaudeSubagentTranscripts(transcript)
    expect(agent!.messages.map((message) => message.id)).toEqual([
      'subagent:abc123:u1',
      'subagent:abc123:a1'
    ])
    expect(agent!.finished).toBe(true)
  })

  it('is empty for a session that spawned nothing', async () => {
    await rm(folder, { recursive: true })
    expect(await readClaudeSubagentTranscripts(transcript)).toEqual([])
  })
})
