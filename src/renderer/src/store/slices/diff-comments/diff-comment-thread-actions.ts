import type { StateCreator } from 'zustand'
import type { AppState } from '../../types'
import type { DiffComment } from '../../../../../shared/file-review/diff-comment-types'
import { createNonSecureContextUuid } from '../../../../../shared/identifiers/non-secure-context-uuid'
import {
  withDiffCommentReply,
  withDiffCommentResolved
} from '../../../../../shared/file-review/diff-comment-thread'
import { enqueueDiffCommentPersist, mutateDiffComments } from './diff-comment-persistence'
import { readOwnedDiffComments, type DiffCommentOwner } from './diff-comment-owner'
import type { DiffCommentsSlice } from './create-diff-comments-slice'

async function persistThreadChange(
  set: Parameters<StateCreator<AppState>>[0],
  get: () => AppState,
  owner: DiffCommentOwner,
  change: (existing: DiffComment[]) => DiffComment[] | null
): Promise<boolean> {
  const result = mutateDiffComments(set, owner, change)
  if (!result) {
    return false
  }
  try {
    await enqueueDiffCommentPersist(set, owner.worktreeId, get, result)
    return true
  } catch (err) {
    console.error('Failed to persist diff comments:', err)
    return false
  }
}

/** A code or visual note's thread: the user's replies and Resolve (the agent's go through `orca notes`). */
export function createDiffCommentThreadActions(
  set: Parameters<StateCreator<AppState>>[0],
  get: () => AppState
): Pick<DiffCommentsSlice, 'replyToDiffComment' | 'setDiffCommentResolved'> {
  return {
    replyToDiffComment: async (owner, commentId, body) => {
      const trimmed = body.trim()
      if (!trimmed || !readOwnedDiffComments(get(), owner)) {
        return false
      }
      const reply = {
        id: createNonSecureContextUuid(),
        author: 'user' as const,
        body: trimmed,
        createdAt: Date.now()
      }
      return persistThreadChange(set, get, owner, (existing) =>
        withDiffCommentReply(existing, commentId, reply)
      )
    },

    setDiffCommentResolved: async (owner, commentId, resolved) => {
      if (!readOwnedDiffComments(get(), owner)) {
        return false
      }
      return persistThreadChange(set, get, owner, (existing) =>
        withDiffCommentResolved(existing, commentId, resolved ? Date.now() : undefined)
      )
    }
  }
}
