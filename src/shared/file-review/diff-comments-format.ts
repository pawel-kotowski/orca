import type { DiffComment } from './diff-comment-types'

function isMarkdownComment(comment: Pick<DiffComment, 'source'>): boolean {
  return comment.source === 'markdown'
}

/** Code and visual notes keep a thread an agent can answer on, so they stay after a send. */
export function isThreadedDiffComment(comment: Pick<DiffComment, 'source'>): boolean {
  return comment.source === 'code' || comment.source === 'visual'
}

function escapeNoteText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
}

function locationLabelOf(c: DiffComment): string {
  return c.lineNumber === 0
    ? 'Scope: file'
    : c.startLine !== undefined && c.startLine !== c.lineNumber
      ? `Lines: ${c.startLine}-${c.lineNumber}`
      : `Line: ${c.lineNumber}`
}

function excerptLines(text: string | undefined): string[] {
  const excerpt = text?.trim()
  return excerpt ? [`Excerpt:\n${quoteMarkdownNoteExcerpt(excerpt)}`] : []
}

function threadLines(c: DiffComment): string[] {
  const replies = c.replies ?? []
  return [
    ...replies.map(
      (reply) =>
        `${reply.author === 'agent' ? 'Agent' : 'User'} reply: "${escapeNoteText(reply.body)}"`
    ),
    ...(c.resolvedAt ? ['Resolved: yes'] : [])
  ]
}

function formatThreadedDiffComment(c: DiffComment, escaped: string): string {
  if (c.source === 'visual' && c.visual) {
    return [
      `Note: ${c.id}`,
      `Visual: ${c.filePath}`,
      `Part: ${c.visual.selector}`,
      ...(c.visual.show ? [`Shows code: ${c.visual.show}`] : []),
      ...excerptLines(c.visual.text),
      `User comment: "${escaped}"`,
      ...threadLines(c)
    ].join('\n')
  }
  return [
    `Note: ${c.id}`,
    `File: ${c.filePath}`,
    'Source: code',
    locationLabelOf(c),
    ...excerptLines(c.selectedText),
    `User comment: "${escaped}"`,
    ...threadLines(c)
  ].join('\n')
}

// Keep the pasted review-note contract deterministic and quote-safe across clients/agents.
export function formatDiffComment(c: DiffComment): string {
  const escaped = escapeNoteText(c.body)
  if (isThreadedDiffComment(c)) {
    return formatThreadedDiffComment(c, escaped)
  }
  const locationLabel = locationLabelOf(c)
  if (!isMarkdownComment(c)) {
    return [`File: ${c.filePath}`, locationLabel, `User comment: "${escaped}"`].join('\n')
  }
  // Line numbers go stale once the file is edited; the text the note was left on still locates it.
  return [
    `File: ${c.filePath}`,
    'Source: markdown',
    locationLabel,
    ...excerptLines(c.selectedText),
    `User comment: "${escaped}"`
  ].join('\n')
}

export function quoteMarkdownNoteExcerpt(text: string): string {
  return `> ${text.replace(/\r\n|\r|\n/g, '\n> ')}`
}

/** What an agent may do with threaded notes; printed once after them. */
export const THREADED_NOTES_ANSWER_HINT =
  'Answer here in chat, or on a note\'s own thread: `orca notes reply <note id> --body "<answer>"` (it shows on the note in Orca), and `orca notes resolve <note id>` once it is done. `orca notes list` shows every note with its thread.'

export function formatDiffComments(comments: readonly DiffComment[]): string {
  const body = comments.map(formatDiffComment).join('\n\n')
  return comments.some(isThreadedDiffComment) ? `${body}\n\n${THREADED_NOTES_ANSWER_HINT}` : body
}
