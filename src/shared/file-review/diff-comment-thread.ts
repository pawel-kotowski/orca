import type { DiffComment, DiffCommentReply } from './diff-comment-types'

/** The list with `reply` added to note `id`'s thread, or null when no such note is there. */
export function withDiffCommentReply(
  comments: readonly DiffComment[],
  id: string,
  reply: DiffCommentReply
): DiffComment[] | null {
  if (!comments.some((comment) => comment.id === id)) {
    return null
  }
  return comments.map((comment) =>
    comment.id === id ? { ...comment, replies: [...(comment.replies ?? []), reply] } : comment
  )
}

/** The list with note `id` resolved at `resolvedAt` (undefined reopens it), or null when it is missing. */
export function withDiffCommentResolved(
  comments: readonly DiffComment[],
  id: string,
  resolvedAt: number | undefined
): DiffComment[] | null {
  if (!comments.some((comment) => comment.id === id)) {
    return null
  }
  return comments.map((comment) => {
    if (comment.id !== id) {
      return comment
    }
    const { resolvedAt: _previous, ...rest } = comment
    return resolvedAt === undefined ? rest : { ...rest, resolvedAt }
  })
}

/** A note named by its full id or by a unique start of it, as `orca notes list` prints them. */
export function findDiffCommentByIdPrefix(
  comments: readonly DiffComment[],
  idOrPrefix: string
): { comment: DiffComment } | { error: 'not_found' | 'ambiguous' } {
  const exact = comments.find((comment) => comment.id === idOrPrefix)
  if (exact) {
    return { comment: exact }
  }
  const matches = idOrPrefix ? comments.filter((comment) => comment.id.startsWith(idOrPrefix)) : []
  if (matches.length === 1) {
    return { comment: matches[0] }
  }
  return { error: matches.length === 0 ? 'not_found' : 'ambiguous' }
}
