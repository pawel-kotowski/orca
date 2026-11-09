import React, { useSyncExternalStore } from 'react'
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

// Why a module store: the list owns its rows, the button sits in the header above it.
let projectHeaderKeys: readonly string[] = []
const listeners = new Set<() => void>()

/** The Projects list publishes the collapse keys of the project headers it shows. */
export function publishSidebarProjectHeaderKeys(keys: readonly string[]): void {
  if (
    keys.length === projectHeaderKeys.length &&
    keys.every((k, i) => k === projectHeaderKeys[i])
  ) {
    return
  }
  projectHeaderKeys = keys
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Collapse every project, or expand everything (Paweł, 2026-11-09: "i need expand/collapse all
 * in projects view"). Collapsing leaves project groups (Work, Personal) open, so their projects
 * show as one compact list; expanding opens groups and projects alike.
 */
export function SidebarCollapseAllButton(): React.JSX.Element | null {
  const keys = useSyncExternalStore(
    subscribe,
    () => projectHeaderKeys,
    () => projectHeaderKeys
  )
  const collapsedGroups = useAppStore((s) => s.collapsedGroups)
  const setCollapsedGroups = useAppStore((s) => s.setCollapsedGroups)
  const allCollapsed = keys.length > 0 && keys.every((key) => collapsedGroups.has(key))
  const label = allCollapsed
    ? translate('components.sidebar.expandAll', 'Expand all')
    : translate('components.sidebar.collapseAll', 'Collapse all projects')
  if (keys.length === 0 && collapsedGroups.size === 0) {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          className="text-muted-foreground"
          aria-label={label}
          onClick={() =>
            setCollapsedGroups(allCollapsed ? new Set() : new Set([...collapsedGroups, ...keys]))
          }
        >
          {allCollapsed ? (
            <ChevronsUpDown className="size-3.5" strokeWidth={2.25} />
          ) : (
            <ChevronsDownUp className="size-3.5" strokeWidth={2.25} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
