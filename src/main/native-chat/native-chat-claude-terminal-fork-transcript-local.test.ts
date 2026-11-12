import '../claude/transcripts/claude-conversation-worker.test-fixture'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forkNativeChatClaudeTranscript } from './native-chat-claude-terminal-fork'

// The real copy worker on a recorded Claude transcript: what a terminal chat's Fork and "Restart
// from here" write for `claude --resume` to open.
type Row = { uuid?: string; type?: string; message?: { content?: unknown } }

let root: string
let path: string
let rows: Row[]

const parse = (contents: string): Row[] =>
  contents
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Row)

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'orca-terminal-fork-'))
  const original = await readFile(
    new URL('../claude/__fixtures__/claude-rewind-hook.jsonl', import.meta.url),
    'utf8'
  )
  rows = parse(original)
  const project = join(root, 'claude-profiles', 'acc-1', 'home', 'projects', 'workspace')
  await mkdir(project, { recursive: true })
  path = join(project, `${(rows[6] as { sessionId: string }).sessionId}.jsonl`)
  await writeFile(path, original)
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const fork = (kind: 'through-response' | 'before-prompt', uuid: string) =>
  forkNativeChatClaudeTranscript({ sessionId: 'chat', cut: { kind, uuid } }, () => path)

describe('a terminal Claude chat copy', () => {
  it('copies through a response into a new session beside the source', async () => {
    const response = rows[47]!.uuid!
    const result = await fork('through-response', response)
    expect(result.ok && result.kind).toBe('copy')
    if (!result.ok || result.kind !== 'copy') {
      return
    }
    expect(dirname(result.transcriptPath)).toBe(dirname(path))
    const copy = parse(await readFile(result.transcriptPath, 'utf8'))
    // The copy gets new ids and runs through the end of the response's turn.
    const last = copy.findLast((row) => row.type === 'user' || row.type === 'assistant')
    expect(last?.uuid).toBe(result.throughUuid)
    expect(copy.map((row) => row.message?.content)).toContainEqual(rows[47]!.message?.content)
    // The source is only read.
    expect(parse(await readFile(path, 'utf8'))).toHaveLength(rows.length)
  })

  it('cuts just before a later prompt', async () => {
    const prompt = rows[34]!.uuid!
    const result = await fork('before-prompt', prompt)
    expect(result.ok && result.kind).toBe('copy')
    if (!result.ok || result.kind !== 'copy') {
      return
    }
    const copy = parse(await readFile(result.transcriptPath, 'utf8'))
    expect(copy.some((row) => row.message?.content === rows[34]!.message?.content)).toBe(false)
    expect(copy.some((row) => row.message?.content === rows[6]!.message?.content)).toBe(true)
  })

  it('makes no copy before the first prompt', async () => {
    expect(await fork('before-prompt', rows[6]!.uuid!)).toEqual({ ok: true, kind: 'empty' })
  })
})
