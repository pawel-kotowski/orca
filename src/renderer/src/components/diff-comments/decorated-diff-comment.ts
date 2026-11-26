import type { DiffComment } from '../../../../shared/file-review/diff-comment-types'

export type DecoratedDiffComment = DiffComment & {
  author?: string
  authorAvatarUrl?: string
  createdAtLabel?: string
  url?: string
  canDelete?: boolean
  canEdit?: boolean
  /** Set when the lines a code note was left on changed since: what to tell the user. */
  staleLabel?: string | null
}
