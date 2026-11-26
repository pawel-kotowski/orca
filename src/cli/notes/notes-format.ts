import { basename } from 'node:path'
import type { DiffComment } from '../../shared/file-review/diff-comment-types'

function indent(text: string, prefix: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

function noteLocation(note: DiffComment): string {
  if (note.source === 'visual' && note.visual) {
    const shows = note.visual.show ? `, shows ${note.visual.show}` : ''
    return `${note.filePath} → ${note.visual.selector} (visual${shows})`
  }
  const lines =
    note.lineNumber === 0
      ? ''
      : note.startLine !== undefined && note.startLine !== note.lineNumber
        ? `:${note.startLine}-${note.lineNumber}`
        : `:${note.lineNumber}`
  return `${note.filePath}${lines} (${note.source ?? 'diff'})`
}

function noteExcerpt(note: DiffComment): string | undefined {
  const text = note.source === 'visual' ? note.visual?.text : note.selectedText
  // A code note's lines keep their indentation.
  return text?.trim()
    ? note.source === 'code'
      ? text.replace(/\s+$/, '')
      : text.trim()
    : undefined
}

/** One note as `orca notes list` prints it: id, place, the text it is on, its thread. */
export function formatNoteForList(note: DiffComment): string {
  const excerpt = noteExcerpt(note)
  return [
    `[${note.id.slice(0, 8)}] ${noteLocation(note)}${note.resolvedAt ? '  resolved' : ''}`,
    ...(excerpt ? [indent(excerpt, '    > ')] : []),
    indent(`User: ${note.body}`, '  '),
    ...(note.replies ?? []).map((reply) =>
      indent(`${reply.author === 'agent' ? 'Agent' : 'User'}: ${reply.body}`, '  ')
    )
  ].join('\n')
}

export function formatNotesList(notes: readonly DiffComment[], includesResolved: boolean): string {
  if (notes.length === 0) {
    return includesResolved ? 'No notes in this workspace.' : 'No open notes in this workspace.'
  }
  const visuals = new Set(
    notes.filter((note) => note.source === 'visual').map((note) => basename(note.filePath))
  )
  const heading = `${notes.length} ${includesResolved ? '' : 'open '}note${notes.length === 1 ? '' : 's'}${
    visuals.size > 0 ? ` (visuals: ${[...visuals].join(', ')})` : ''
  }`
  return [
    heading,
    '',
    notes.map(formatNoteForList).join('\n\n'),
    '',
    'Reply: orca notes reply <id> --body "<answer>"   Resolve: orca notes resolve <id>'
  ].join('\n')
}
