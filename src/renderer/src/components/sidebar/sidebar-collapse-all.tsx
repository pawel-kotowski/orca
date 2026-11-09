import React, { useSyncExternalStore } from 'react'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useAppStore } from '@/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

type HeaderRow = {
  type: string
  key?: string
  collapseKey?: string
  repo?: unknown
  projectGroup?: { id: string | null }
  projectGroupDepth?: number
}

// Why a module store: the list owns its rows, the group headers render one row at a time.
// Kept across renders: a collapsed group's projects leave the rows, but expanding needs them.
let projectKeysByGroupId: ReadonlyMap<string, readonly string[]> = new Map()
const listeners = new Set<() => void>()

/** The Projects list publishes, per project group, the collapse keys of its project headers. */
export function publishSidebarGroupProjectKeys(rows: readonly HeaderRow[]): void {
  const next = new Map(projectKeysByGroupId)
  const seen = new Map<string, string[]>()
  const stack: { id: string; depth: number }[] = []
  for (const row of rows) {
    if (row.type !== 'header') {
      continue
    }
    const depth = row.projectGroupDepth ?? 0
    while (stack.length > 0 && stack.at(-1)!.depth >= depth) {
      stack.pop()
    }
    if (row.projectGroup && !row.repo) {
      // Why null: the "Ungrouped" lane has no group of its own and no button.
      stack.push({ id: row.projectGroup.id ?? '', depth })
      if (row.projectGroup.id) {
        seen.set(row.projectGroup.id, seen.get(row.projectGroup.id) ?? [])
      }
    } else if (row.repo) {
      for (const group of stack) {
        seen.get(group.id)?.push(row.collapseKey ?? row.key ?? '')
      }
    }
  }
  let changed = false
  for (const [groupId, keys] of seen) {
    const previous = next.get(groupId)
    // Why: a collapsed group lists no projects now; keep the ones it showed before.
    if (keys.length === 0 && previous) {
      continue
    }
    if (!previous || previous.length !== keys.length || previous.some((k, i) => k !== keys[i])) {
      next.set(groupId, keys)
      changed = true
    }
  }
  if (changed) {
    projectKeysByGroupId = next
    for (const listener of listeners) {
      listener()
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const NO_KEYS: readonly string[] = []

/**
 * Collapse or expand every project of one group, on the group's own header (Paweł, 2026-11-09:
 * "expand collapse all should be in work / personal rows"). A collapsed group opens with all its
 * projects; an open one collapses its projects (it stays open, a compact list), or expands them
 * once they all are.
 */
export function ProjectGroupCollapseAllButton({
  groupId,
  groupCollapseKey
}: {
  groupId: string
  groupCollapseKey: string
}): React.JSX.Element | null {
  const keys = useSyncExternalStore(
    subscribe,
    () => projectKeysByGroupId.get(groupId) ?? NO_KEYS,
    () => NO_KEYS
  )
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const setCollapsedGroups = useAppStore((s) => s.setCollapsedGroups)
  if (keys.length === 0) {
    return null
  }
  const groupCollapsed = collapsedGroups.has(groupCollapseKey)
  const expand = groupCollapsed || keys.every((key) => collapsedGroups.has(key))
  const label = expand
    ? translate('components.sidebar.expandAll', 'Expand all')
    : translate('components.sidebar.collapseAll', 'Collapse all projects')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          data-project-group-collapse-all=""
          className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
          data-repo-header-action=""
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            const next = new Set(collapsedGroups)
            if (expand) {
              next.delete(groupCollapseKey)
              keys.forEach((key) => next.delete(key))
            } else {
              keys.forEach((key) => next.add(key))
            }
            setCollapsedGroups(next)
          }}
        >
          {expand ? (
            <ChevronsUpDown className="size-3.5" strokeWidth={2.25} />
          ) : (
            <ChevronsDownUp className="size-3.5" strokeWidth={2.25} />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
