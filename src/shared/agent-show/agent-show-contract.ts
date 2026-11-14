import { z } from 'zod'
import type { TabContentType, TabGroupLayoutNode } from '../tab-types'

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

/** The shows one tour step stages: the same requests `orca show code|tree|file|ui` send. */
export const AgentShowTourStageRequest = z.discriminatedUnion('kind', [
  AgentShowCodeRequest,
  AgentShowTreeRequest,
  AgentShowFileRequest,
  AgentShowUiRequest
])
export type AgentShowTourStageRequest = z.infer<typeof AgentShowTourStageRequest>

export const AGENT_SHOW_TOUR_ACTIONS = [
  'start',
  'next',
  'back',
  'step',
  'play',
  'pause',
  'stop',
  'state'
] as const

export const AgentShowTourRequest = z.object({
  kind: z.literal('tour'),
  action: z.enum(AGENT_SHOW_TOUR_ACTIONS),
  /** 1-based; the step to start on or move to. */
  step: z.number().int().positive().optional(),
  play: z.boolean().default(false),
  /** start: stage every step once and report each one's problems, then go to `step`. */
  check: z.boolean().default(false),
  tour: z
    .object({
      title: z.string().min(1).max(200),
      file: z.string().min(1),
      steps: z
        .array(
          z.object({
            title: z.string().min(1).max(200),
            caption: z.string().max(1200),
            holdMs: z.number().int().positive().max(120_000).nullable(),
            requests: z.array(AgentShowTourStageRequest).max(12)
          })
        )
        .min(1)
        .max(40)
    })
    .optional()
})

export const AgentShowRequest = z.discriminatedUnion('kind', [
  AgentShowCodeRequest,
  AgentShowTreeRequest,
  AgentShowFileRequest,
  AgentShowUiRequest,
  AgentShowClearRequest,
  AgentShowStateRequest,
  AgentShowTourRequest
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
  // False (--no-focus): do not activate tabs or the sidebar, and do not move the view.
  focus: boolean
}

export type AgentShowVisibleEditor = {
  groupId: string
  tabId: string
  filePath: string
  visibleRange: { startLine: number; endLine: number } | null
  marks: string[]
  fontSize: number
  /** Lines the pane shows at its current font. */
  paneLines: number
  /** Its marked range is visible whole (true when it carries no marks). */
  fits: boolean
}

/** Where a tour is: its step, whether it plays, and what went wrong staging the step. */
export type AgentShowTourInfo = {
  title: string
  file: string
  step: number
  steps: number
  stepTitle: string
  playing: boolean
  problems: string[]
}

/** How a shown range fits its pane: the font it got and how many of its lines are on screen. */
export type AgentShowCodeFit = {
  linesVisible: number
  rangeLines: number
  fontSize: number
  userFontSize: number
}

export type AgentShowLayoutTab = {
  tabId: string
  contentType: TabContentType
  label: string
  filePath: string | null
  isOwner: boolean
}

export type AgentShowLayout = {
  root: TabGroupLayoutNode | null
  activeGroupId: string | null
  groups: { groupId: string; activeTabId: string | null; tabs: AgentShowLayoutTab[] }[]
}

export type AgentShowState = {
  worktreeOnScreen: boolean
  layout: AgentShowLayout
  ownerTabVisible: boolean
  editors: AgentShowVisibleEditor[]
  explorer: { open: boolean; highlighted: string[] }
  browser: { pageId: string; url: string; marks: string[] }[]
}

export type AgentShowResult =
  | {
      ok: true
      visible: boolean
      detail?: string
      state?: AgentShowState
      fit?: AgentShowCodeFit
      tour?: AgentShowTourInfo
    }
  | { ok: false; code: string; message: string }

export type AgentShowHandler<K extends AgentShowRequest['kind']> = (
  request: AgentShowRequestOf<K>,
  context: AgentShowContext
) => Promise<AgentShowResult>
