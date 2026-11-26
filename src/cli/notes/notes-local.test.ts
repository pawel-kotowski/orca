import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { DiffComment } from '../../shared/file-review/diff-comment-types'
import { DiffCommentSchema } from '../../shared/file-review/diff-comment-schema'
import type { HandlerContext } from '../dispatch/dispatch'
import { NOTES_HANDLERS } from './notes'

const selectorFromCwd = vi.hoisted(() => vi.fn(async () => 'id:wt'))
vi.mock('../files/file-worktree-target', () => ({
  getFileWorktreeSelector: () => selectorFromCwd(),
  resolveFilePath: async (_ctx: unknown, _worktree: string, path: string) =>
    path.replace('/repo/', '')
}))

const visual: DiffComment = {
  id: '3f2a9c1d-0000-4000-8000-000000000000',
  worktreeId: 'wt',
  filePath: '/data/chat-scratch/f/flow.html',
  source: 'visual',
  lineNumber: 0,
  body: 'What is this box?',
  createdAt: 1,
  side: 'modified',
  visual: { file: 'flow.html', sessionId: 's', selector: '#retry', text: 'Retry loop' }
}
const code: DiffComment = {
  id: '9b1e0000-0000-4000-8000-000000000000',
  worktreeId: 'wt',
  filePath: 'src/queue.ts',
  source: 'code',
  startLine: 40,
  lineNumber: 42,
  selectedText: '  retry()',
  body: 'Too many retries',
  createdAt: 2,
  side: 'modified',
  resolvedAt: 9
}

type Call = (method: string, params: Record<string, unknown>) => Promise<unknown>

/** The notes a write sent, read back through the schema the host validates with. */
function writtenNotes(params: Record<string, unknown>): DiffComment[] {
  return z.array(DiffCommentSchema).parse(params.diffComments)
}

function context(flags: Record<string, string | boolean>, notes: DiffComment[]) {
  const calls: { method: string; params: Record<string, unknown> }[] = []
  const client: { isRemote: boolean; call: Call } = {
    isRemote: false,
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params })
      return method === 'worktree.show'
        ? { result: { worktree: { id: 'repo::/repo', diffComments: notes } } }
        : { result: {} }
    }
  }
  const ctx = {
    flags: new Map(Object.entries(flags)),
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handlers call only client.call and read isRemote, which this fake has.
    client: client as unknown as HandlerContext['client'],
    cwd: '/repo',
    json: false
  } satisfies HandlerContext
  return { ctx, calls, client }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('orca notes', () => {
  it('lists open notes with where they are and the text they are on', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await NOTES_HANDLERS['notes list'](context({}, [visual, code]).ctx)
    const printed = String(log.mock.calls[0][0])
    expect(printed).toContain('[3f2a9c1d] /data/chat-scratch/f/flow.html → #retry (visual)')
    expect(printed).toContain('> Retry loop')
    expect(printed).not.toContain('Too many retries')
  })

  it('keeps one file with --file, a visual by its file name', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await NOTES_HANDLERS['notes list'](
      context({ file: 'src/queue.ts', all: true }, [visual, code]).ctx
    )
    expect(String(log.mock.calls[0][0])).toContain('[9b1e0000] src/queue.ts:40-42 (code)  resolved')
    await NOTES_HANDLERS['notes list'](context({ file: 'flow.html' }, [visual, code]).ctx)
    expect(String(log.mock.calls[1][0])).toContain('1 open note (visuals: flow.html)')
  })

  it('writes an agent reply with the list it read as the base, so the host merges it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ctx, calls } = context({ id: '3f2a', body: ' It retries twice. ' }, [visual, code])
    await NOTES_HANDLERS['notes reply'](ctx)
    const write = calls.find((call) => call.method === 'worktree.set')!
    expect(write.params.worktree).toBe('id:wt')
    expect(write.params.diffCommentsBase).toEqual([visual, code])
    const written = writtenNotes(write.params)
    expect(written[0].replies).toMatchObject([{ author: 'agent', body: 'It retries twice.' }])
    expect(written[1]).toEqual(code)
  })

  it('resolves by id and refuses an unknown one', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ctx, calls } = context({ id: '3f2a9c1d' }, [visual])
    await NOTES_HANDLERS['notes resolve'](ctx)
    const written = writtenNotes(calls.find((call) => call.method === 'worktree.set')!.params)
    expect(typeof written[0].resolvedAt).toBe('number')
    await expect(
      NOTES_HANDLERS['notes resolve'](context({ id: 'zz' }, [visual]).ctx)
    ).rejects.toThrow('No note "zz"')
  })

  it('writes a folder workspace through its own update', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { ctx, calls, client } = context({ resolved: true }, [visual, code])
    client.call = async (method) => {
      calls.push({ method, params: {} })
      return method === 'worktree.show'
        ? { result: { worktree: { id: 'folder:f1', diffComments: [visual, code] } } }
        : { result: {} }
    }
    await NOTES_HANDLERS['notes clear'](ctx)
    expect(calls.map((call) => call.method)).toEqual(['worktree.show', 'folderWorkspace.update'])
  })

  it("uses a chat agent's own workspace when its shell is in the chat's scratch folder", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubEnv('ORCA_WORKTREE_ID', '')
    vi.stubEnv('ORCA_WORKSPACE_ID', '')
    vi.stubEnv('ORCA_AGENT_SESSION_ID', 'session-1')
    selectorFromCwd.mockRejectedValueOnce(
      new Error('No Orca workspace contains the current directory')
    )
    const { ctx, calls, client } = context({}, [visual])
    const base = client.call
    client.call = async (method, params) => {
      if (method !== 'agent.show') {
        return base(method, params)
      }
      calls.push({ method, params })
      return { result: { places: [{ worktreeId: 'repo::/repo' }] } }
    }
    await NOTES_HANDLERS['notes list'](ctx)
    expect(calls.find((call) => call.method === 'worktree.show')!.params.worktree).toBe(
      'id:repo::/repo'
    )
  })
})
