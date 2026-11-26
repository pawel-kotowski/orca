import { useAppStore } from '@/store'
import { sendMessageToAgent } from '@/lib/agent-session/messaging/agent-message-send'
import { deriveNotesSendAgentTargets } from '@/lib/agent-session/messaging/notes-send-agent-targets'
import type { AgentMessageTarget } from '@/lib/agent-session/messaging/agent-message-target'
import type { DiffCommentOwner } from '@/store/slices/diff-comments/diff-comment-owner'
import type { DiffComment } from '../../../../../../../shared/file-review/diff-comment-types'
import { formatDiffComments } from '../../../../../../../shared/file-review/diff-comments-format'
import type { NativeChatVisualNotePin } from '../../../../../../../shared/native-chat/visuals/native-chat-visual-note-bridge'
import { TERMINAL_CHATS_VISUAL_SESSION_ID } from '../../../../../../../shared/native-chat/visuals/native-chat-visual-directive'
import type { ChatVisualTabIdentity } from '../../../../../../../shared/native-chat/visuals/chat-visual-tab-identity'

/** The notes on one visual, oldest first: the order their pins are numbered in. */
export function notesOnVisual(
  comments: readonly DiffComment[],
  path: string | null
): DiffComment[] {
  if (!path) {
    return []
  }
  return comments
    .filter((comment) => comment.source === 'visual' && comment.filePath === path && comment.visual)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export function visualNotePins(
  notes: readonly DiffComment[],
  activeId: string | null
): NativeChatVisualNotePin[] {
  return notes.flatMap((note, index) =>
    note.visual
      ? [
          {
            id: note.id,
            n: index + 1,
            selector: note.visual.selector,
            text: note.visual.text,
            ...(note.visual.show ? { show: note.visual.show } : {}),
            resolved: note.resolvedAt !== undefined,
            active: note.id === activeId
          }
        ]
      : []
  )
}

export function visualNotesPrompt(
  identity: ChatVisualTabIdentity,
  path: string,
  notes: readonly DiffComment[]
): string {
  const name = identity.title ? `"${identity.title}" (${path})` : path
  const count = notes.length === 1 ? '1 comment' : `${notes.length} comments`
  return `I left ${count} on the visual ${name}. Each names the part of the page it is on.\n\n${formatDiffComments(notes)}`
}

/** The chat the visual came from, as a send target: a structured chat by session, a terminal chat by its pane. */
function chatTargetOf(
  identity: ChatVisualTabIdentity,
  worktreeId: string
): AgentMessageTarget | null {
  if (identity.sessionId !== TERMINAL_CHATS_VISUAL_SESSION_ID) {
    return { kind: 'structured-session', sessionId: identity.sessionId }
  }
  const state = useAppStore.getState()
  const targets = deriveNotesSendAgentTargets(state, worktreeId, new Map())
  const target = targets.find(
    (candidate) => candidate.tabId === identity.chatTabId && candidate.status === 'eligible'
  )
  return target?.messageTarget ?? null
}

export type VisualNotesSendOutcome = 'sent' | 'no-chat' | 'refused'

/** Sends the notes into the visual's own chat as the user's message; sent notes keep their threads. */
export async function sendVisualNotesToChat(args: {
  identity: ChatVisualTabIdentity
  worktreeId: string
  owner: DiffCommentOwner
  path: string
  notes: readonly DiffComment[]
}): Promise<VisualNotesSendOutcome> {
  const target = chatTargetOf(args.identity, args.worktreeId)
  if (!target) {
    return 'no-chat'
  }
  const result = await sendMessageToAgent({
    worktreeId: args.worktreeId,
    target,
    prompt: visualNotesPrompt(args.identity, args.path, args.notes)
  })
  if (result.status !== 'sent') {
    return 'refused'
  }
  await useAppStore.getState().clearDeliveredDiffComments(args.owner, args.notes)
  return 'sent'
}
