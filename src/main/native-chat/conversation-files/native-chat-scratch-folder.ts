// Store scratch files beside the host’s chat journal, outside the user’s workspace.

import { createHash } from 'node:crypto'
import { join } from 'node:path'

const NATIVE_CHAT_SCRATCH_DIR_NAME = 'chat-scratch'
const FOLDER_NAME = /^[0-9a-f]{32}$/

export function nativeChatScratchRootFor(stateDirectory: string): string {
  return join(stateDirectory, NATIVE_CHAT_SCRATCH_DIR_NAME)
}

/** Hash arbitrary session IDs into one safe path segment. */
export function nativeChatScratchFolderName(sessionId: string): string {
  return createHash('sha256').update(sessionId, 'utf8').digest('hex').slice(0, 32)
}

export function isNativeChatScratchFolderName(name: string): boolean {
  return FOLDER_NAME.test(name)
}

/** Session-only identity permits lookup/removal without a workspace record. */
export function nativeChatScratchFolderFor(stateDirectory: string, sessionId: string): string {
  return join(nativeChatScratchRootFor(stateDirectory), nativeChatScratchFolderName(sessionId))
}

/**
 * Terminal-backed chats share one folder per host (Paweł, 2026-11-10: the terminal Chat UI should
 * show HTML as structured chats do). A terminal agent starts before its session has an id, and a
 * session resumes in other panes, so no per-chat folder can be named at launch; the visuals skill
 * asks for a new file name each time. Not a 32-hex name, so the chat-folder sweep leaves it.
 */
export const TERMINAL_CHATS_SCRATCH_DIR_NAME = 'terminal-chats'

export function terminalChatsScratchFolderFor(stateDirectory: string): string {
  return join(nativeChatScratchRootFor(stateDirectory), TERMINAL_CHATS_SCRATCH_DIR_NAME)
}
