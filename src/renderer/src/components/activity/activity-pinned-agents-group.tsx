import { useCallback, useMemo, useState, type ComponentProps } from 'react'
import { ActivityStatusGroupHeader } from './activity-thread-controls'
import { READ_AGENTS_GROUP_KEY } from './activity-thread-grouping'
import type { ActivityThreadGroup } from './activity-thread-types'
import { ActivityThreadVirtualRow } from './activity-thread-virtual-row'

type RowProps = Omit<ComponentProps<typeof ActivityThreadVirtualRow>, 'item' | 'collapsed'>

/** Other agents leaves the scrolled list for the pinned section at its foot. */
export function useActivityPinnedGroupSplit(groups: ActivityThreadGroup[]): {
  pinnedGroup: ActivityThreadGroup | undefined
  listGroups: ActivityThreadGroup[]
} {
  return useMemo(
    () => ({
      pinnedGroup: groups.find((group) => group.key === READ_AGENTS_GROUP_KEY),
      listGroups: groups.filter((group) => group.key !== READ_AGENTS_GROUP_KEY)
    }),
    [groups]
  )
}

const OPEN_STORAGE_KEY = 'orca.activityOtherAgentsOpen'

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function writeOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_STORAGE_KEY, open ? '1' : '0')
  } catch {
    // Why: a page without storage still toggles; it just forgets on reload.
  }
}

/**
 * The "Other agents" section, pinned to the bottom of the activity list: closed, its header sits at
 * the list's foot; opening it slides the header up with its cards below it, like a drawer (Paweł,
 * 2026-11-08: "pinned to bottom and open to top", "header should go up on expansion"). Closed
 * until opened; the choice is kept for this viewer.
 */
export function ActivityPinnedAgentsGroup({
  group,
  rowProps
}: {
  group: ActivityThreadGroup
  rowProps: RowProps
}): React.JSX.Element {
  const [open, setOpen] = useState(readOpen)
  const toggle = useCallback(() => {
    setOpen((current) => {
      writeOpen(!current)
      return !current
    })
  }, [])
  return (
    <div
      data-activity-pinned-group={group.key}
      className="flex max-h-[55%] min-h-0 shrink-0 flex-col border-t border-border/60"
    >
      <div className="shrink-0 px-1.5 py-1.5">
        <ActivityStatusGroupHeader group={group} collapsed={!open} onToggle={toggle} opensUp />
      </div>
      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-1.5 scrollbar-sleek">
          {group.threads.map((thread) => (
            <ActivityThreadVirtualRow
              key={thread.paneKey}
              item={{ type: 'thread', thread, groupKey: group.key }}
              collapsed={false}
              {...rowProps}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
