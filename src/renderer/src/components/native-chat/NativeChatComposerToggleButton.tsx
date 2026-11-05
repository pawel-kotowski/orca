import { useLayoutEffect, useRef } from 'react'
import { registerNativeChatCornerSlot } from './native-chat-corner-slot'

/**
 * Where Jump to latest draws: just above the message box, its right edge on the box's right edge.
 * It lives in the box's column, so it follows the box at any pane width and never covers the
 * corner (the floating workspace launcher's place). A hidden box offers no slot, and Jump to
 * latest keeps its own corner over the transcript.
 */
export function NativeChatComposerToggleButton({
  collapsed
}: {
  collapsed: boolean
}): React.JSX.Element | null {
  const slotRef = useRef<HTMLDivElement>(null)
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
      className="absolute right-0 bottom-[calc(100%+0.5rem)] z-10 flex gap-2"
    />
  )
}
