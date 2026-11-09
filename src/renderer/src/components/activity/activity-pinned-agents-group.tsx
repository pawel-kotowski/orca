import { useCallback, useMemo, useState, type ComponentProps } from 'react'
import { ActivityStatusGroupHeader } from './activity-thread-controls'
import { READ_AGENTS_GROUP_KEY } from './activity-thread-grouping'
import { WORKING_GROUP_KEY } from './activity-inbox-sections'
import { ActivityAutoStandByControl } from './activity-auto-stand-by-control'
import type { ActivityThreadGroup } from './activity-thread-types'
import { ActivityThreadVirtualRow } from './activity-thread-virtual-row'

type RowProps = Omit<ComponentProps<typeof ActivityThreadVirtualRow>, 'item' | 'collapsed'>

const PINNED_GROUP_KEYS = [WORKING_GROUP_KEY, READ_AGENTS_GROUP_KEY]

/** Working and Standing by leave the scrolled list for drawers at its foot, Working on top. */
export function useActivityPinnedGroupSplit(groups: ActivityThreadGroup[]): {
  pinnedGroups: ActivityThreadGroup[]
  listGroups: ActivityThreadGroup[]
} {
  return useMemo(
    () => ({
      pinnedGroups: PINNED_GROUP_KEYS.flatMap((key) => groups.filter((group) => group.key === key)),
      listGroups: groups.filter((group) => !PINNED_GROUP_KEYS.includes(group.key))
    }),
    [groups]
  )
}

// Why the old key for Standing by: it keeps the open state Other agents had.
const OPEN_STORAGE_KEYS: Record<string, { key: string; openByDefault: boolean }> = {
  [READ_AGENTS_GROUP_KEY]: { key: 'orca.activityOtherAgentsOpen', openByDefault: false },
  [WORKING_GROUP_KEY]: { key: 'orca.activityWorkingOpen', openByDefault: true }
}

function readOpen(groupKey: string): boolean {
  const config = OPEN_STORAGE_KEYS[groupKey]
  try {
    const stored = config ? window.localStorage.getItem(config.key) : null
    return stored === null ? (config?.openByDefault ?? false) : stored === '1'
  } catch {
    return config?.openByDefault ?? false
  }
}

function writeOpen(groupKey: string, open: boolean): void {
  const config = OPEN_STORAGE_KEYS[groupKey]
  try {
    if (config) {
      window.localStorage.setItem(config.key, open ? '1' : '0')
    }
  } catch {
    // Why: a page without storage still toggles; it just forgets on reload.
  }
}

/**
 * A section pinned to the bottom of the activity list: closed, its header sits at the list's foot;
 * opening it slides the header up with its cards below it, like a drawer (Paweł, 2026-11-08:
 * "pinned to bottom and open to top"). Each drawer keeps its own open state for this viewer.
 */
function ActivityPinnedAgentsGroup({
  group,
  rowProps
}: {
  group: ActivityThreadGroup
  rowProps: RowProps
}): React.JSX.Element {
  const [open, setOpen] = useState(() => readOpen(group.key))
  const toggle = useCallback(() => {
    setOpen((current) => {
      writeOpen(group.key, !current)
      return !current
    })
  }, [group.key])
  return (
    <div
      data-activity-pinned-group={group.key}
      className="flex min-h-0 flex-[0_1_auto] flex-col border-t border-border/60"
    >
      <div className="shrink-0 px-1.5 py-1.5">
        <ActivityStatusGroupHeader
          group={group}
          collapsed={!open}
          onToggle={toggle}
          opensUp
          extra={group.key === READ_AGENTS_GROUP_KEY ? <ActivityAutoStandByControl /> : null}
        />
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

export function ActivityPinnedAgentsGroups({
  groups,
  rowProps
}: {
  groups: ActivityThreadGroup[]
  rowProps: RowProps
}): React.JSX.Element | null {
  if (groups.length === 0) {
    return null
  }
  return (
    <div className="flex max-h-[70%] min-h-0 shrink-0 flex-col">
      {groups.map((group) => (
        <ActivityPinnedAgentsGroup key={group.key} group={group} rowProps={rowProps} />
      ))}
    </div>
  )
}
