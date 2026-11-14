import { z } from 'zod'

// Why: one contract for `orca show`, so the CLI, the RPC layer and each renderer area agree without importing each other.

export const AGENT_SHOW_PLACEMENTS = ['beside', 'right', 'below', 'same'] as const
export type AgentShowPlacement = (typeof AGENT_SHOW_PLACEMENTS)[number]

export const AGENT_SHOW_CLEAR_SCOPES = ['code', 'tree', 'ui', 'all'] as const
export type AgentShowClearScope = (typeof AGENT_SHOW_CLEAR_SCOPES)[number]

const LineRange = z
  .object({
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive()
  })
  .refine((r) => r.endLine >= r.startLine, { message: 'endLine must be >= startLine' })

const Note = z.string().min(1).max(600)
const Mark = z.string().min(1).max(8)

export const AgentShowCodeRequest = z.object({
  kind: z.literal('code'),
  filePath: z.string().min(1),
  range: LineRange,
  note: Note.optional(),
  mark: Mark.optional(),
  place: z.enum(AGENT_SHOW_PLACEMENTS).default('beside'),
  keepOthers: z.boolean().default(false)
})

export const AgentShowTreeRequest = z.object({
  kind: z.literal('tree'),
  entries: z
    .array(z.object({ path: z.string().min(1), label: z.string().max(80).optional() }))
    .min(1)
    .max(40),
  expand: z.boolean().default(true),
  dimOthers: z.boolean().default(false)
})

export const AgentShowFileRequest = z.object({
  kind: z.literal('file'),
  filePath: z.string().min(1),
  preview: z.boolean().default(false),
  place: z.enum(AGENT_SHOW_PLACEMENTS).default('beside')
})

export const AgentShowUiRequest = z.object({
  kind: z.literal('ui'),
  target: z
    .object({
      selector: z.string().min(1).optional(),
      ref: z.string().min(1).optional(),
      text: z.string().min(1).optional()
    })
    .refine((t) => [t.selector, t.ref, t.text].filter(Boolean).length === 1, {
      message: 'exactly one of selector, ref, text'
    }),
  pageId: z.string().min(1).optional(),
  note: Note.optional(),
  mark: Mark.optional(),
  code: z.object({ filePath: z.string().min(1), range: LineRange }).optional()
})

export const AgentShowClearRequest = z.object({
  kind: z.literal('clear'),
  scope: z.enum(AGENT_SHOW_CLEAR_SCOPES).default('all')
})

export const AgentShowStateRequest = z.object({ kind: z.literal('state') })

export const AgentShowRequest = z.discriminatedUnion('kind', [
  AgentShowCodeRequest,
  AgentShowTreeRequest,
  AgentShowFileRequest,
  AgentShowUiRequest,
  AgentShowClearRequest,
  AgentShowStateRequest
])

export type AgentShowRequest = z.infer<typeof AgentShowRequest>
export type AgentShowRequestOf<K extends AgentShowRequest['kind']> = Extract<
  AgentShowRequest,
  { kind: K }
>

// Who asked: marks belong to the agent's own tab (ORCA_TAB_ID), so clearing never touches another agent's.
export type AgentShowContext = {
  worktreeId: string
  worktreePath: string
  ownerTabId: string | null
}

export type AgentShowVisibleEditor = {
  groupId: string
  tabId: string
  filePath: string
  visibleRange: { startLine: number; endLine: number } | null
  marks: string[]
}

export type AgentShowState = {
  worktreeOnScreen: boolean
  ownerTabVisible: boolean
  editors: AgentShowVisibleEditor[]
  explorer: { open: boolean; highlighted: string[] }
  browser: { pageId: string; url: string; marks: string[] }[]
}

export type AgentShowResult =
  | { ok: true; visible: boolean; detail?: string; state?: AgentShowState }
  | { ok: false; code: string; message: string }

export type AgentShowHandler<K extends AgentShowRequest['kind']> = (
  request: AgentShowRequestOf<K>,
  context: AgentShowContext
) => Promise<AgentShowResult>
