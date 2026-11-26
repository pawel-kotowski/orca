import { basename, resolve as resolvePath } from 'node:path'
import type { DiffComment } from '../../shared/file-review/diff-comment-types'
import {
  findDiffCommentByIdPrefix,
  withDiffCommentReply,
  withDiffCommentResolved
} from '../../shared/file-review/diff-comment-thread'
import { createNonSecureContextUuid } from '../../shared/identifiers/non-secure-context-uuid'
import { parseWorkspaceKey } from '../../shared/workspace/identity/workspace-scope'
import type { CommandHandler, HandlerContext } from '../dispatch/dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../arguments/flags'
import { RuntimeClientError } from '../runtime/connection/types'
import { getFileWorktreeSelector, resolveFilePath } from '../files/file-worktree-target'
import { formatNotesList } from './notes-format'
import { getCallerWorkspaceIds } from '../workspace-selection/caller-host-worktree-selection'
import { readInjectedAgentSessionId } from '../../shared/agent-session/lifecycle/launch/agent-session-caller-env'

type NotesWorkspace = { id: string; displayName?: string; diffComments?: DiffComment[] }

/** The calling agent's own workspace: a terminal agent's pane names it, a chat names it by session. */
async function callerAgentWorkspace(ctx: HandlerContext): Promise<string | null> {
  if (ctx.client.isRemote) {
    return null
  }
  const paneWorkspace = getCallerWorkspaceIds()[0]
  if (paneWorkspace) {
    return `id:${paneWorkspace}`
  }
  const sessionId = readInjectedAgentSessionId()
  if (!sessionId) {
    return null
  }
  const shown = await ctx.client
    .call<{ places?: { worktreeId?: string }[] }>('agent.show', { id: sessionId })
    .catch(() => null)
  const worktreeId = shown?.result.places?.find((place) => place.worktreeId)?.worktreeId
  return worktreeId ? `id:${worktreeId}` : null
}

/** --worktree or the folder's workspace; from a folder outside every workspace (a chat's scratch folder), the agent's own. */
async function notesWorkspaceSelector(ctx: HandlerContext): Promise<string> {
  try {
    return await getFileWorktreeSelector(ctx)
  } catch (error) {
    const fallback = ctx.flags.has('worktree') ? null : await callerAgentWorkspace(ctx)
    if (!fallback) {
      throw error
    }
    return fallback
  }
}

async function readNotesWorkspace(
  ctx: HandlerContext
): Promise<{ selector: string; workspace: NotesWorkspace }> {
  const selector = await notesWorkspaceSelector(ctx)
  const response = await ctx.client.call<{ worktree: NotesWorkspace }>('worktree.show', {
    worktree: selector,
    matchFolderWorkspaces: true
  })
  return { selector, workspace: response.result.worktree }
}

/** Writes only this edit: the host merges it over notes another window changed meanwhile. */
async function writeNotes(
  ctx: HandlerContext,
  selector: string,
  workspace: NotesWorkspace,
  next: DiffComment[]
): Promise<void> {
  const diffCommentsBase = workspace.diffComments ?? []
  const folder = parseWorkspaceKey(workspace.id)
  if (folder?.type === 'folder') {
    await ctx.client.call('folderWorkspace.update', {
      folderWorkspaceId: folder.folderWorkspaceId,
      updates: { diffComments: next, diffCommentsBase }
    })
    return
  }
  await ctx.client.call('worktree.set', {
    worktree: selector,
    diffComments: next,
    diffCommentsBase
  })
}

function noteIdArgument(ctx: HandlerContext): string {
  return getRequiredStringFlag(ctx.flags, 'id')
}

function findNote(comments: readonly DiffComment[], id: string): DiffComment {
  const found = findDiffCommentByIdPrefix(comments, id)
  if ('comment' in found) {
    return found.comment
  }
  throw new RuntimeClientError(
    'invalid_argument',
    found.error === 'ambiguous'
      ? `More than one note starts with "${id}"; give more of its id.`
      : `No note "${id}" in this workspace. Run \`orca notes list --all\` to see them.`
  )
}

async function fileMatcher(
  ctx: HandlerContext,
  selector: string
): Promise<((note: DiffComment) => boolean) | null> {
  const file = getOptionalStringFlag(ctx.flags, 'file')
  if (!file) {
    return null
  }
  const absolute = resolvePath(ctx.cwd, file)
  const relative = await resolveFilePath(ctx, selector, absolute).catch(() => absolute)
  const names = new Set([file, absolute, relative])
  return (note) =>
    names.has(note.filePath) || (note.source === 'visual' && basename(note.filePath) === file)
}

function print(ctx: HandlerContext, result: unknown, text: string): void {
  console.log(ctx.json ? JSON.stringify({ ok: true, result }, null, 2) : text)
}

export const NOTES_HANDLERS: Record<string, CommandHandler> = {
  'notes list': async (ctx) => {
    const { selector, workspace } = await readNotesWorkspace(ctx)
    const matches = await fileMatcher(ctx, selector)
    const includeResolved = ctx.flags.get('all') === true
    const notes = (workspace.diffComments ?? []).filter(
      (note) => (includeResolved || !note.resolvedAt) && (!matches || matches(note))
    )
    print(ctx, { notes }, formatNotesList(notes, includeResolved))
  },
  'notes reply': async (ctx) => {
    const body = getRequiredStringFlag(ctx.flags, 'body').trim()
    if (!body) {
      throw new RuntimeClientError('invalid_argument', 'The reply is empty.')
    }
    const { selector, workspace } = await readNotesWorkspace(ctx)
    const current = workspace.diffComments ?? []
    const note = findNote(current, noteIdArgument(ctx))
    const reply = {
      id: createNonSecureContextUuid(),
      author: 'agent' as const,
      body,
      createdAt: Date.now()
    }
    await writeNotes(
      ctx,
      selector,
      workspace,
      withDiffCommentReply(current, note.id, reply) ?? current
    )
    print(
      ctx,
      { noteId: note.id, reply },
      `Replied on note ${note.id.slice(0, 8)}; it shows on the note in Orca.`
    )
  },
  'notes resolve': async (ctx) => {
    const reopen = ctx.flags.get('reopen') === true
    const { selector, workspace } = await readNotesWorkspace(ctx)
    const current = workspace.diffComments ?? []
    const note = findNote(current, noteIdArgument(ctx))
    const next =
      withDiffCommentResolved(current, note.id, reopen ? undefined : Date.now()) ?? current
    await writeNotes(ctx, selector, workspace, next)
    print(
      ctx,
      { noteId: note.id, resolved: !reopen },
      `${reopen ? 'Reopened' : 'Resolved'} note ${note.id.slice(0, 8)}.`
    )
  },
  'notes clear': async (ctx) => {
    const { selector, workspace } = await readNotesWorkspace(ctx)
    const matches = await fileMatcher(ctx, selector)
    const onlyResolved = ctx.flags.get('resolved') === true
    const current = workspace.diffComments ?? []
    const next = current.filter(
      (note) => !((!matches || matches(note)) && (!onlyResolved || note.resolvedAt))
    )
    await writeNotes(ctx, selector, workspace, next)
    const removed = current.length - next.length
    print(ctx, { removed }, `Removed ${removed} note${removed === 1 ? '' : 's'}.`)
  }
}
