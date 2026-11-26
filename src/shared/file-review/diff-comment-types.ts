// Persist line review notes on WorktreeMeta for existing orca-data.json storage and later agent handoff.
/** 'code': a plain editor's lines; 'visual': a part of a chat visual (an HTML page in the chat's scratch folder). */
export type DiffCommentSource = 'diff' | 'markdown' | 'code' | 'visual'
export type DiffReviewScope = 'unstaged' | 'staged' | 'branch'

export type MobileDiffReviewFileState = {
  key: string
  filePath: string
  oldPath?: string
  scope: DiffReviewScope
  lastOpenedAt?: number
  lastSeenDiffIdentity?: string
  reviewedAt?: number
  reviewDiffIdentity?: string
}

export type MobileDiffReviewState = {
  version: 1
  updatedAt?: number
  completedAt?: number
  files: Record<string, MobileDiffReviewFileState>
}

/** One answer in a note's thread, from the user or from an agent (`orca notes reply`). */
export type DiffCommentReply = {
  id: string
  author: 'user' | 'agent'
  body: string
  createdAt: number
}

/** The part of a chat visual a note is on: how the page finds it again, and what it said. */
export type DiffCommentVisualAnchor = {
  /** The visual's bare file name in its chat's scratch folder. */
  file: string
  /** The chat visual's session: a structured chat's id, or the terminal chats' shared folder id. */
  sessionId: string
  /** The paired host the chat runs on; absent for this computer. */
  environmentId?: string
  /** The visual's title in chat, when it had one. */
  title?: string
  /** The chat tab the visual was shown in, so its code links open beside that chat. */
  chatTabId?: string
  /** A CSS selector for the element, from the nearest id (or body) down. */
  selector: string
  /** The element's visible text when the note was left. */
  text: string
  /** The element's `data-orca-show` (path:a-b), when it has one. */
  show?: string
}

export type DiffComment = {
  id: string
  worktreeId: string
  filePath: string
  /** Undefined means a legacy diff note. */
  source?: DiffCommentSource
  /** Exact text selected when creating a markdown note, when available. */
  selectedText?: string
  /** Inclusive range start. Must be <= lineNumber when present. */
  startLine?: number
  lineNumber: number
  body: string
  createdAt: number
  updatedAt?: number
  /** Set after the note has been handed to an agent. Edits clear it. */
  sentAt?: number
  scope?: DiffReviewScope
  oldPath?: string
  diffIdentity?: string
  // Reserved for future "comments on the original side" — always 'modified' in v1.
  side: 'modified'
  /** Set on visual notes; `filePath` is then the visual's absolute path on the chat's host. */
  visual?: DiffCommentVisualAnchor
  replies?: DiffCommentReply[]
  resolvedAt?: number
}
