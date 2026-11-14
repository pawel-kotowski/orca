// Why: `orca show ui` marks live in the guest page; main injects them and reports clicks back to the renderer.

export const AGENT_SHOW_PAGE_MARK_CHANNEL = 'agentShow:markPage'
export const AGENT_SHOW_PAGE_CLEAR_CHANNEL = 'agentShow:clearPageMarks'
export const AGENT_SHOW_PAGE_EVENT_CHANNEL = 'agentShow:pageMarkEvent'

export type AgentShowPageTarget = { selector?: string; ref?: string; text?: string }

export type AgentShowPageMarkArgs = {
  browserPageId: string
  worktreeId: string
  /** Unique per page across owners; the page reports clicks by it. */
  key: string
  label: string
  note: string | null
  /** `path:a-b` shown in the bubble; set only when the mark links to code. */
  codeLabel: string | null
  target: AgentShowPageTarget
}

export type AgentShowPageMarkResult =
  | { ok: true; url: string; matches: number; visibleMatches: number; inViewport: boolean }
  | { ok: false; code: string; message: string }

export type AgentShowPageClearArgs = { browserPageId: string; keys: string[] }

export type AgentShowPageEvent =
  | { kind: 'open-code'; browserPageId: string; key: string }
  /** The page navigated away or closed: its marks are gone. */
  | { kind: 'reset'; browserPageId: string }
