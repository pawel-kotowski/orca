import { useCallback, useEffect, useRef } from 'react'
import { INBOX_GROUP_KEY } from './activity-inbox-sections'
import { readLegacyLocalStorage, useViewLayoutValue } from './view-layout-memory'

const MIN_LIST_HEIGHT = 48
// The Inbox keeps room for a card, or for its header once folded (the stack's cap reads it).
const MIN_INBOX_HEIGHT = 112
const FOLDED_INBOX_HEIGHT = 52
export const INBOX_ROOM_VAR = '--activity-inbox-room'
// Why this far: only a deliberate drag past all the Inbox's room folds it (Paweł, 2026-11-16: "inbox
// keeps collapsing" — the bound used to stop at the drawer's cards, so a short drag folded it).
const TAKEOVER_OVERSHOOT = 96

/** Sent with the drawer's group key when a drag takes the list over. */
export const ACTIVITY_DRAWER_TAKEOVER_EVENT = 'orca:activity-drawer-takeover'

/** Run `onTakeover` when another section's drag takes the list over. */
export function useActivityDrawerTakeover(ownKey: string, onTakeover: () => void): void {
  const latest = useRef(onTakeover)
  latest.current = onTakeover
  useEffect(() => {
    const listener = (event: Event): void => {
      if ((event as CustomEvent<string>).detail !== ownKey) {
        latest.current()
      }
    }
    window.addEventListener(ACTIVITY_DRAWER_TAKEOVER_EVENT, listener)
    return () => window.removeEventListener(ACTIVITY_DRAWER_TAKEOVER_EVENT, listener)
  }, [ownKey])
}

function parseHeight(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_LIST_HEIGHT
    ? value
    : undefined
}

function legacyHeight(groupKey: string): number | undefined {
  const stored = readLegacyLocalStorage(`orca.activityDrawerHeight.${groupKey}`)
  return stored === null ? undefined : parseHeight(Number(stored))
}

/** A drawer's height before it is dragged: room for a few cards, whatever it holds. */
export const DEFAULT_DRAWER_HEIGHT = 240

/**
 * A pinned drawer's card list, resized by dragging the top edge of its header (Paweł, 2026-11-09:
 * "all those sections should be resizable"). Up grows the list, taking room from the Inbox above;
 * a double click goes back to the default height. The height is Paweł's, never the cards': a drawer
 * keeps it with one card or fifty (2026-11-16: "working panel should not change size to adapt to
 * cards ... i decide the size"). Saved in settings (`view-layout-memory.ts`).
 */
export function useActivityDrawerHeight(groupKey: string): {
  height: number
  listRef: React.RefObject<HTMLDivElement | null>
  onResizePointerDown: (event: React.PointerEvent<HTMLElement>) => void
  resetHeight: () => void
} {
  const legacy = useCallback(() => legacyHeight(groupKey), [groupKey])
  const {
    value: height,
    preview: setHeight,
    commit
  } = useViewLayoutValue<number>(
    `activityDrawerHeight.${groupKey}`,
    parseHeight,
    DEFAULT_DRAWER_HEIGHT,
    legacy
  )
  const listRef = useRef<HTMLDivElement | null>(null)
  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const list = listRef.current
      if (!list || event.button !== 0) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const handle = event.currentTarget
      const startY = event.clientY
      const startHeight = list.getBoundingClientRect().height
      // Why bounds: past the Inbox's minimum the drawers shrink together, so the list grows slower
      // than the pointer and the edge leaves it (Paweł, 2026-11-09: "cursor detaches from grabbed
      // edge"). The drag stops there instead. The cards set no bound: an emptier drawer keeps the
      // height it is given.
      const measureMax = (): number => {
        const inbox = list
          .closest('aside')
          ?.querySelector('[data-activity-virtual-list]')?.parentElement
        const aside = list.closest('aside')
        const keep = aside
          ? Number.parseFloat(getComputedStyle(aside).getPropertyValue(INBOX_ROOM_VAR)) ||
            MIN_INBOX_HEIGHT
          : MIN_INBOX_HEIGHT
        const inboxRoom = inbox ? Math.max(0, inbox.clientHeight - keep) : 0
        const current = list.getBoundingClientRect().height
        return current + inboxRoom
      }
      let maxHeight = measureMax()
      let tookOver = false
      let latest = startHeight
      handle.setPointerCapture(event.pointerId)
      const move = (moveEvent: PointerEvent): void => {
        const wanted = startHeight + startY - moveEvent.clientY
        // Why: dragged well past the room, this drawer takes the list: the other drawer closes and
        // the Inbox collapses to its header (Paweł, 2026-11-09: "when i drag high enough it should
        // just close working and inbox sections"); the freed room is measured once it lays out.
        if (!tookOver && wanted > maxHeight + TAKEOVER_OVERSHOOT) {
          tookOver = true
          window.dispatchEvent(
            new CustomEvent(ACTIVITY_DRAWER_TAKEOVER_EVENT, { detail: groupKey })
          )
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              maxHeight = measureMax()
            })
          )
        }
        latest = Math.min(maxHeight, Math.max(MIN_LIST_HEIGHT, wanted))
        setHeight(latest)
      }
      const end = (): void => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', end)
        handle.removeEventListener('pointercancel', end)
        commit(latest)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', end)
      handle.addEventListener('pointercancel', end)
    },
    [commit, groupKey, setHeight]
  )
  const resetHeight = useCallback(() => commit(undefined), [commit])
  return { height, listRef, onResizePointerDown, resetHeight }
}

/**
 * A drawer dragged past its room takes the list; the Inbox folds to its header. Returns the
 * list's style: how much room the Inbox keeps under the drawers (a card's worth, or only its
 * header once folded), read by the drawer stack's cap and by a drag's bound.
 */
export function useInboxFoldsOnDrawerTakeover(
  collapsedGroupKeys: ReadonlySet<string>,
  toggleGroup: (groupKey: string) => void
): React.CSSProperties {
  useActivityDrawerTakeover(INBOX_GROUP_KEY, () => {
    if (!collapsedGroupKeys.has(INBOX_GROUP_KEY)) {
      toggleGroup(INBOX_GROUP_KEY)
    }
  })
  const folded = collapsedGroupKeys.has(INBOX_GROUP_KEY)
  return {
    [INBOX_ROOM_VAR]: `${folded ? FOLDED_INBOX_HEIGHT : MIN_INBOX_HEIGHT}px`
  } as React.CSSProperties
}
