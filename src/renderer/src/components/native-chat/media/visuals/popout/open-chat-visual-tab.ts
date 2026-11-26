// Paweł, 2026-11-26: a chat visual "will get lost in chat" as the conversation goes on, so it opens
// in an editor tab of its own beside the chat, with its code links still opening beside that chat.
import { useAppStore } from '@/store'
import { captureLinkOpenIntent } from '@/lib/links/placement/link-open-intent'
import { captureWorktreeOperationGenerationSnapshot } from '@/lib/workspace/ownership/worktree-operation-generation'
import { resolveWorktreeOperationRoute } from '@/lib/workspace/ownership/worktree-operation-route'
import { openWorkspaceEditorItem } from '@/store/slices/editor/tabs/workspace-editor-item'
import type { OpenFile } from '@/store/slices/editor/types/open-file'
import {
  chatVisualTabFileId,
  type ChatVisualTabIdentity
} from '../../../../../../../shared/native-chat/visuals/chat-visual-tab-identity'

export function chatVisualTabLabel(identity: ChatVisualTabIdentity): string {
  return identity.title ?? identity.file
}

type Listener = (noteId: string | null, commentMode: boolean) => void
const focusListeners = new Map<string, Set<Listener>>()
const pendingFocus = new Map<string, { noteId: string | null; commentMode: boolean }>()

/** What an open asks the tab to show first: a note's thread, or comment mode on. */
export function takeChatVisualTabFocus(
  fileId: string
): { noteId: string | null; commentMode: boolean } | null {
  const pending = pendingFocus.get(fileId) ?? null
  pendingFocus.delete(fileId)
  return pending
}

export function subscribeChatVisualTabFocus(fileId: string, listener: Listener): () => void {
  const listeners = focusListeners.get(fileId) ?? new Set<Listener>()
  listeners.add(listener)
  focusListeners.set(fileId, listeners)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      focusListeners.delete(fileId)
    }
  }
}

function requestFocus(fileId: string, noteId: string | null, commentMode: boolean): void {
  const listeners = focusListeners.get(fileId)
  if (listeners && listeners.size > 0) {
    for (const listener of listeners) {
      listener(noteId, commentMode)
    }
    return
  }
  pendingFocus.set(fileId, { noteId, commentMode })
}

/** Opens (or brings back) the visual's tab beside its chat; restore passes the saved group and place. */
export function openChatVisualTab(
  identity: ChatVisualTabIdentity,
  worktreeId: string,
  options?: { noteId?: string; commentMode?: boolean; groupId?: string; groupIndex?: number }
): boolean {
  const state = useAppStore.getState()
  const route = resolveWorktreeOperationRoute(state, worktreeId)
  if (!route) {
    return false
  }
  // One tab per visual, whichever chat tab or note opened it.
  const open = state.openFiles.find(
    (file) =>
      file.mode === 'chat-visual' &&
      file.worktreeId === worktreeId &&
      file.chatVisual?.file === identity.file &&
      file.chatVisual.sessionId === identity.sessionId &&
      file.chatVisual.environmentId === identity.environmentId
  )
  const id = open?.id ?? chatVisualTabFileId(identity)
  const label = chatVisualTabLabel(open?.chatVisual ?? identity)
  if (options?.noteId || options?.commentMode) {
    requestFocus(id, options.noteId ?? null, options.commentMode === true)
  }
  if (open) {
    openWorkspaceEditorItem(state, id, worktreeId, label, 'chat-visual')
    return true
  }
  const file: Omit<OpenFile, 'id' | 'isDirty'> = {
    filePath: id,
    relativePath: label,
    worktreeId,
    runtimeEnvironmentId: route.runtimeEnvironmentId,
    language: 'plaintext',
    operationProvenance: {
      generation: captureWorktreeOperationGenerationSnapshot(route),
      ownershipProjection: 'explicit'
    },
    mode: 'chat-visual',
    chatVisual: identity
  }
  if (options?.groupId) {
    state.openFile(file, {
      reopenId: id,
      preview: false,
      targetGroupId: options.groupId,
      ...(options.groupIndex !== undefined ? { groupIndex: options.groupIndex } : {})
    })
    return true
  }
  const intent = captureLinkOpenIntent(state, worktreeId, identity.chatTabId)
  if (!intent || !state.openFileForLink(file, { reopenId: id, preview: false }, intent)) {
    state.openFile(file, { reopenId: id, preview: false })
  }
  return true
}
