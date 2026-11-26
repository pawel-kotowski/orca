import { describe, expect, it } from 'vitest'
import type { DiffComment } from './diff-comment-types'
import {
  findDiffCommentByIdPrefix,
  withDiffCommentReply,
  withDiffCommentResolved
} from './diff-comment-thread'
import { applyDiffCommentWrite } from './diff-comment-mutation'
import { formatDiffComments } from './diff-comments-format'

const note = (id: string, extra: Partial<DiffComment> = {}): DiffComment => ({
  id,
  worktreeId: 'wt',
  filePath: 'src/a.ts',
  source: 'code',
  lineNumber: 4,
  startLine: 2,
  selectedText: '  b\n  c\n  d',
  body: 'why?',
  createdAt: 1,
  side: 'modified',
  ...extra
})

describe('note threads', () => {
  it("adds an agent reply that survives the host's merge with a note another window added", () => {
    const base = [note('aaaa1111')]
    const replied = withDiffCommentReply(base, 'aaaa1111', {
      id: 'r1',
      author: 'agent',
      body: 'Because of the retry loop.',
      createdAt: 2
    })!
    const hostNow = [...base, note('bbbb2222', { body: 'added elsewhere' })]
    const merged = applyDiffCommentWrite(hostNow, {
      diffComments: replied,
      diffCommentsBase: base
    })!
    expect(merged.map((c) => c.id)).toEqual(['aaaa1111', 'bbbb2222'])
    expect(merged[0].replies).toEqual([
      { id: 'r1', author: 'agent', body: 'Because of the retry loop.', createdAt: 2 }
    ])
  })

  it('resolves and reopens, and refuses a note that is not there', () => {
    const resolved = withDiffCommentResolved([note('aaaa1111')], 'aaaa1111', 5)!
    expect(resolved[0].resolvedAt).toBe(5)
    expect('resolvedAt' in withDiffCommentResolved(resolved, 'aaaa1111', undefined)![0]).toBe(false)
    expect(withDiffCommentResolved(resolved, 'nope', 5)).toBeNull()
    expect(
      withDiffCommentReply(resolved, 'nope', { id: 'r', author: 'user', body: 'x', createdAt: 1 })
    ).toBeNull()
  })

  it('finds a note by a unique start of its id', () => {
    const list = [note('aaaa1111'), note('aaab2222')]
    expect(findDiffCommentByIdPrefix(list, 'aaab')).toEqual({ comment: list[1] })
    expect(findDiffCommentByIdPrefix(list, 'aaa')).toEqual({ error: 'ambiguous' })
    expect(findDiffCommentByIdPrefix(list, 'zz')).toEqual({ error: 'not_found' })
    expect(findDiffCommentByIdPrefix(list, '')).toEqual({ error: 'not_found' })
  })

  it('prints a visual note with its part, its thread and how to answer it', () => {
    const visual = note('cccc3333', {
      source: 'visual',
      filePath: '/s/chat-scratch/f/flow.html',
      lineNumber: 0,
      startLine: undefined,
      selectedText: undefined,
      visual: {
        file: 'flow.html',
        sessionId: 's',
        selector: '#queue > div:nth-of-type(2)',
        text: 'Retry loop',
        show: 'src/queue.ts:40-62'
      },
      replies: [{ id: 'r', author: 'agent', body: 'It backs off "twice"', createdAt: 3 }]
    })
    expect(formatDiffComments([visual])).toBe(
      [
        'Note: cccc3333',
        'Visual: /s/chat-scratch/f/flow.html',
        'Part: #queue > div:nth-of-type(2)',
        'Shows code: src/queue.ts:40-62',
        'Excerpt:\n> Retry loop',
        'User comment: "why?"',
        'Agent reply: "It backs off \\"twice\\""',
        '',
        'Answer here in chat, or on a note\'s own thread: `orca notes reply <note id> --body "<answer>"` (it shows on the note in Orca), and `orca notes resolve <note id>` once it is done. `orca notes list` shows every note with its thread.'
      ].join('\n')
    )
  })
})
