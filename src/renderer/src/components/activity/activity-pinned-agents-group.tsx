import { useCallback, useMemo, type ComponentProps } from 'react'
import { ActivityStatusGroupHeader } from './activity-thread-controls'
import { READ_AGENTS_GROUP_KEY } from './activity-thread-grouping'
import { WORKING_GROUP_KEY } from './activity-inbox-sections'
import { useActivityDrawerHeight, useActivityDrawerTakeover } from './activity-drawer-resize'
import { translate } from '@/i18n/i18n'
import type { ActivityThreadGroup } from './activity-thread-types'
import { ActivityThreadVirtualRow } from './activity-thread-virtual-row'
import { parseBoolean, readLegacyLocalStorage, useViewLayoutValue } from './view-layout-memory'

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

// Why the old keys: the first read moves the open state each drawer had in localStorage.
const OPEN_DEFAULTS: Record<string, { legacyKey: string; openByDefault: boolean }> = {
  [READ_AGENTS_GROUP_KEY]: { legacyKey: 'orca.activityOtherAgentsOpen', openByDefault: false },
  [WORKING_GROUP_KEY]: { legacyKey: 'orca.activityWorkingOpen', openByDefault: true }
}

/** Whether a drawer is open, saved in settings so it survives restarts and new builds. */
function useDrawerOpen(groupKey: string): [boolean, (open: boolean) => void] {
  const config = OPEN_DEFAULTS[groupKey]
  const legacy = useCallback(() => {
    const stored = config ? readLegacyLocalStorage(config.legacyKey) : null
    return stored === null ? undefined : stored === '1'
  }, [config])
  const { value, commit } = useViewLayoutValue(
    `activityDrawerOpen.${groupKey}`,
    parseBoolean,
    config?.openByDefault ?? false,
    legacy
  )
  return [value, commit]
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
  const [open, setOpen] = useDrawerOpen(group.key)
  const toggle = useCallback(() => setOpen(!open), [open, setOpen])
  const { height, listRef, onResizePointerDown, resetHeight } = useActivityDrawerHeight(group.key)
  useActivityDrawerTakeover(group.key, () => setOpen(false))
  return (
    // Why `contents`: the header and the cards sit straight in the stack's column, so a header
    // never shrinks and only the card lists share the room (a shrinking drawer slid one header
    // under the other).
    <div data-activity-pinned-group={group.key} className="contents">
      <div className="relative shrink-0 border-t border-border/60 px-1.5 py-1.5">
        {open ? (
          // Why on the header's top edge: dragging it up grows this drawer's cards below it.
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={translate('components.activity.resizeSection', 'Resize section')}
            onPointerDown={onResizePointerDown}
            onDoubleClick={resetHeight}
            className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize transition-colors hover:bg-ring/30 active:bg-ring/50"
          />
        ) : null}
        <ActivityStatusGroupHeader group={group} collapsed={!open} onToggle={toggle} opensUp />
      </div>
      {open ? (
        <div
          ref={listRef}
          // Why a fixed basis: the drawer keeps the height Paweł gave it however many cards it holds;
          // it shrinks only when the window leaves the Inbox too little room.
          style={{ flex: `0 1 ${height}px` }}
          className="min-h-0 overflow-y-auto overflow-x-hidden px-1.5 pb-1.5 scrollbar-sleek"
        >
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
    // Why the cap: the Inbox above always keeps room for a card or two.
    <div className="flex max-h-[calc(100%-var(--activity-inbox-room,7rem))] min-h-0 shrink-0 flex-col">
      {groups.map((group) => (
        <ActivityPinnedAgentsGroup key={group.key} group={group} rowProps={rowProps} />
      ))}
    </div>
  )
}
