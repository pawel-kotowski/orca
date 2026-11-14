import { z } from 'zod'
import {
  AgentShowTourStageRequest,
  AgentShowUiRequest
} from '../../../../shared/agent-show/agent-show-contract'

const LineMark = z.object({
  mark: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  note: z.string().optional(),
  seq: z.number().optional(),
  tabId: z.string().optional()
})

/** What one agent's tab showed, enough to bring the same stage back after a reload or restart. */
export const OwnerShowSnapshot = z.object({
  worktreeId: z.string(),
  worktreePath: z.string(),
  ownerTabId: z.string(),
  code: z.array(z.tuple([z.string(), z.array(LineMark)])),
  stage: z.object({
    openedTabs: z.array(z.tuple([z.string(), z.string()])),
    createdGroups: z.array(z.string()),
    usedGroups: z.array(z.string()),
    foldedSidebars: z.array(z.enum(['left', 'right']))
  }),
  tree: z
    .object({
      worktreePath: z.string(),
      entries: z.array(
        z.object({ path: z.string(), label: z.string().optional(), isDirectory: z.boolean() })
      ),
      dimOthers: z.boolean()
    })
    .nullable(),
  ui: z.array(z.object({ pageId: z.string(), request: AgentShowUiRequest })),
  tour: z
    .object({
      title: z.string(),
      file: z.string(),
      index: z.number().int().nonnegative(),
      steps: z.array(
        z.object({
          title: z.string(),
          caption: z.string(),
          holdMs: z.number().nullable(),
          requests: z.array(AgentShowTourStageRequest)
        })
      )
    })
    .nullable()
    .default(null)
})
export type OwnerShowSnapshot = z.infer<typeof OwnerShowSnapshot>

const StoredShows = z.object({ version: z.literal(1), owners: z.array(OwnerShowSnapshot) })

export function serializeShows(owners: readonly OwnerShowSnapshot[]): string {
  return JSON.stringify({ version: 1, owners })
}

/** Stored owners; nothing when the text is missing, from another version, or damaged. */
export function parseShows(text: string | null): OwnerShowSnapshot[] {
  if (!text) {
    return []
  }
  try {
    const parsed = StoredShows.safeParse(JSON.parse(text))
    return parsed.success ? parsed.data.owners : []
  } catch {
    return []
  }
}

export function isEmptyShow(owner: OwnerShowSnapshot): boolean {
  return owner.code.length === 0 && !owner.tree && owner.ui.length === 0 && !owner.tour
}

/** Owners whose tab is still open in their worktree; the rest are gone for good. */
export function restorableShows(
  owners: readonly OwnerShowSnapshot[],
  tabsByWorktree: Readonly<Record<string, readonly { id: string; entityId: string }[] | undefined>>
): OwnerShowSnapshot[] {
  return owners.filter((owner) =>
    (tabsByWorktree[owner.worktreeId] ?? []).some(
      (tab) => tab.id === owner.ownerTabId || tab.entityId === owner.ownerTabId
    )
  )
}
