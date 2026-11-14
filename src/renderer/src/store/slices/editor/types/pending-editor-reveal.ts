export type PendingEditorReveal = {
  filePath: string
  fileId?: string
  line: number
  column: number
  matchLength: number
  /** Last line of a whole-line range to select and centre; absent reveals one position. */
  endLine?: number
  /** false keeps keyboard focus where it is, e.g. an agent showing code beside its chat. */
  focus?: boolean
  viewStateId?: string
  canApply?: () => boolean
  onApplied?: () => void
}

export type EditorRevealExtent = Pick<PendingEditorReveal, 'endLine' | 'focus'>

export type PendingEditorFocusRequest = {
  fileId: string
  worktreeId: string
  viewStateId: string
  expiresAt: number
  token: number
}

// Why: allow slow SSH mounts without leaving an unrelated future remount armed indefinitely.
export const EDITOR_FOCUS_REQUEST_TTL_MS = 30_000
