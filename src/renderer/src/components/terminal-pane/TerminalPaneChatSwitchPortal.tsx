import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatViewSwitchButton } from '../native-chat/NativeChatViewSwitchButton'
import { floatingLauncherShift } from '../native-chat/native-chat-corner-buttons-layout'
import type { TerminalPaneController } from './use-terminal-pane-controller'

/** The agent terminal's corner switch to its own terminal-backed Chat UI (not an SDK chat). */
export function TerminalPaneChatSwitchPortal({
  controller
}: {
  controller: TerminalPaneController
}): React.JSX.Element | null {
  const {
    activePane,
    activePaneIsChatLeaf,
    isActive,
    isChatEligibleForLeaf,
    terminalContentVisible,
    toggleNativeChatForLeaf
  } = controller
  const leafId = activePane?.leafId ?? null
  if (
    !isActive ||
    !terminalContentVisible ||
    activePaneIsChatLeaf ||
    !activePane?.container ||
    !leafId ||
    !isChatEligibleForLeaf(leafId)
  ) {
    return null
  }
  return createPortal(
    <TerminalPaneChatSwitchButton onSwitch={() => toggleNativeChatForLeaf(leafId)} />,
    activePane.container,
    `terminal-chat-switch-${leafId}`
  )
}

function TerminalPaneChatSwitchButton({ onSwitch }: { onSwitch: () => void }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const shiftRef = useRef(0)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const apply = (): void => {
      // Undo the current shift so the launcher is compared against the resting spot.
      const own = element.getBoundingClientRect()
      const resting = {
        left: own.left + shiftRef.current,
        right: own.right + shiftRef.current,
        top: own.top,
        bottom: own.bottom
      }
      const launcher =
        document
          .querySelector<HTMLElement>('[data-floating-terminal-toggle]')
          ?.getBoundingClientRect() ?? null
      const next = floatingLauncherShift(resting, launcher)
      shiftRef.current = next
      setShift(next)
    }
    let frame = 0
    const measure = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }
    apply()
    const resizeObserver = new ResizeObserver(measure)
    if (element.parentElement) {
      resizeObserver.observe(element.parentElement)
    }
    window.addEventListener('resize', measure)
    window.addEventListener('pointerup', measure)
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('pointerup', measure)
    }
  }, [])

  return (
    <TooltipProvider delayDuration={400}>
      <div
        ref={ref}
        className="absolute right-4 bottom-4 z-10"
        style={shift ? { transform: `translateX(-${shift}px)` } : undefined}
      >
        <NativeChatViewSwitchButton to="chat" onSwitch={onSwitch} />
      </div>
    </TooltipProvider>
  )
}
