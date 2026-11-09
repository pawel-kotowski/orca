import { useLayoutEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { floatingLauncherShift } from './native-chat-corner-buttons-layout'
import { registerNativeChatCornerSlot } from './native-chat-corner-slot'

// Jump to latest's width (28px) and the gap on each side of it.
const BESIDE_ROOM_PX = 28 + 8 + 4

/** Whether the chat leaves room right of the message box for the corner buttons. */
function useRoomBesideBox(
  slotRef: React.RefObject<HTMLDivElement | null>,
  active: boolean
): boolean {
  const [beside, setBeside] = useState(false)
  useLayoutEffect(() => {
    const column = slotRef.current?.parentElement
    const row = column?.parentElement
    if (!active || !column || !row || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = (): void => {
      const box = column.getBoundingClientRect()
      const room = row.getBoundingClientRect().right - box.right >= BESIDE_ROOM_PX
      // Why: beside the box it would sit by the window's corner; the floating workspace launcher
      // there wins, and the button goes back above the box.
      const spot = {
        left: box.right + 8,
        right: box.right + 36,
        top: box.bottom - 28,
        bottom: box.bottom
      }
      const launcher = document.querySelector<HTMLElement>('[data-floating-terminal-toggle]')
      const clear = floatingLauncherShift(spot, launcher?.getBoundingClientRect() ?? null) === 0
      setBeside(room && clear)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(row)
    observer.observe(column)
    return () => observer.disconnect()
  }, [active, slotRef])
  return beside
}

/**
 * Where Jump to latest draws (Paweł, 2026-11-09: "move scroll arrow to the right of chat input if
 * there is space, if not it should be as now and if running shell ui is present then above it"):
 * right of the message box, level with its bottom, when the chat leaves room there; otherwise
 * just above the box, its right edge on the box's right edge, and above the running-shells strip
 * when one shows (`--native-chat-tasks-strip-height`). A hidden box offers no slot, and Jump to
 * latest keeps its own corner over the transcript.
 */
export function NativeChatComposerToggleButton({
  collapsed
}: {
  collapsed: boolean
}): React.JSX.Element | null {
  const slotRef = useRef<HTMLDivElement>(null)
  const beside = useRoomBesideBox(slotRef, !collapsed)
  useLayoutEffect(() => {
    const slot = slotRef.current
    return slot && !collapsed ? registerNativeChatCornerSlot(slot) : undefined
  }, [collapsed])
  if (collapsed) {
    return null
  }
  return (
    <div
      ref={slotRef}
      data-native-chat-corner-slot
      data-beside={beside ? '' : undefined}
      className={cn(
        'absolute z-10 flex gap-2',
        beside
          ? 'bottom-0 left-[calc(100%+0.5rem)]'
          : 'right-0 bottom-[calc(100%+0.5rem+var(--native-chat-tasks-strip-height,0px))]'
      )}
    />
  )
}
