import { useCallback, useRef, useState } from 'react'

const MIN_LIST_HEIGHT = 48

function storageKey(groupKey: string): string {
  return `orca.activityDrawerHeight.${groupKey}`
}

function readHeight(groupKey: string): number | null {
  try {
    const value = Number(window.localStorage.getItem(storageKey(groupKey)))
    return Number.isFinite(value) && value >= MIN_LIST_HEIGHT ? value : null
  } catch {
    return null
  }
}

function writeHeight(groupKey: string, height: number | null): void {
  try {
    if (height === null) {
      window.localStorage.removeItem(storageKey(groupKey))
    } else {
      window.localStorage.setItem(storageKey(groupKey), String(Math.round(height)))
    }
  } catch {
    // Why: without storage the drawer still resizes; it just forgets on reload.
  }
}

/**
 * A pinned drawer's card list, resized by dragging the top edge of its header (Paweł, 2026-11-09:
 * "all those sections should be resizable"). Up grows the list, taking room from the Inbox above;
 * a double click goes back to fitting the cards. Kept per drawer for this viewer.
 */
export function useActivityDrawerHeight(groupKey: string): {
  height: number | null
  listRef: React.RefObject<HTMLDivElement | null>
  onResizePointerDown: (event: React.PointerEvent<HTMLElement>) => void
  resetHeight: () => void
} {
  const [height, setHeight] = useState<number | null>(() => readHeight(groupKey))
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
      let latest = startHeight
      handle.setPointerCapture(event.pointerId)
      const move = (moveEvent: PointerEvent): void => {
        latest = Math.max(MIN_LIST_HEIGHT, startHeight + startY - moveEvent.clientY)
        setHeight(latest)
      }
      const end = (): void => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', end)
        handle.removeEventListener('pointercancel', end)
        writeHeight(groupKey, latest)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', end)
      handle.addEventListener('pointercancel', end)
    },
    [groupKey]
  )
  const resetHeight = useCallback(() => {
    setHeight(null)
    writeHeight(groupKey, null)
  }, [groupKey])
  return { height, listRef, onResizePointerDown, resetHeight }
}
