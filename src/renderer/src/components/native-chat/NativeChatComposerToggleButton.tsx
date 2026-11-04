import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronsDown, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import {
  CORNER_BUTTON_GAP,
  resolveCornerButtonsLayout,
  type CornerButtonsPlacement,
  type CornerRect
} from './native-chat-corner-buttons-layout'
import { NativeChatViewSwitchButton } from './NativeChatViewSwitchButton'
import { registerNativeChatCornerSlot } from './native-chat-corner-slot'

function readFloatingLauncherRect(): CornerRect | null {
  return (
    document
      .querySelector<HTMLElement>('[data-floating-terminal-toggle]')
      ?.getBoundingClientRect() ?? null
  )
}

/**
 * The message box's corner controls: hide/show, and for a terminal-backed chat the switch to its
 * terminal. They sit on the pane's bottom edge right of the message box when it fits, else above.
 */
export function NativeChatComposerToggleButton({
  collapsed,
  hasPendingDraft,
  onToggle,
  onSwitchToTerminal
}: {
  collapsed: boolean
  hasPendingDraft: boolean
  onToggle: (event: React.MouseEvent<HTMLButtonElement>) => void
  onSwitchToTerminal?: () => void
}): React.JSX.Element {
  const label = collapsed
    ? translate('components.native-chat.composer.expand', 'Show message box')
    : translate('components.native-chat.composer.collapse', 'Hide message box')
  const groupRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{ placement: CornerButtonsPlacement; shift: number }>({
    placement: 'above',
    shift: 0
  })
  const hasSwitch = onSwitchToTerminal !== undefined

  useLayoutEffect(() => {
    const group = groupRef.current
    const pane = group?.parentElement
    if (!group || !pane) {
      return
    }
    const root = group.closest<HTMLElement>('[data-native-chat-root="true"]')
    const column = pane.querySelector<HTMLElement>('[data-native-chat-composer-column]')
    const apply = (): void => {
      const next = resolveCornerButtonsLayout({
        pane: pane.getBoundingClientRect(),
        column: collapsed || !column ? null : column.getBoundingClientRect(),
        width: group.offsetWidth,
        height: group.offsetHeight,
        launcher: readFloatingLauncherRect()
      })
      setLayout((current) =>
        current.placement === next.placement && current.shift === next.shift ? current : next
      )
      // Why: Jump to latest sits in the transcript's corner and clears these buttons only when
      // they share its row (above the box, or with the box hidden).
      const sharesTranscriptRow = collapsed || next.placement === 'above'
      root?.style.setProperty(
        '--native-chat-toggle-clearance',
        sharesTranscriptRow ? `${group.offsetWidth + CORNER_BUTTON_GAP + next.shift}px` : '0px'
      )
    }
    let frame = 0
    const measure = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(apply)
    }
    apply()
    // Why: the launcher moves on window resize and on drag (pointerup); the pane, the message box
    // column and the chat root resize independently.
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(pane)
    // Why: Jump to latest joining or leaving the row changes its width.
    resizeObserver.observe(group)
    if (column) {
      resizeObserver.observe(column)
    }
    if (root) {
      resizeObserver.observe(root)
    }
    window.addEventListener('resize', measure)
    window.addEventListener('pointerup', measure)
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('pointerup', measure)
      root?.style.removeProperty('--native-chat-toggle-clearance')
    }
  }, [collapsed, hasSwitch])

  const slotRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const slot = slotRef.current
    return slot ? registerNativeChatCornerSlot(slot) : undefined
  }, [])

  return (
    // Why: its own provider, so the composer field renders with or without the app's.
    <TooltipProvider delayDuration={400}>
      <div
        ref={groupRef}
        className={cn(
          'absolute right-4 z-10 flex gap-2',
          // Why: with the box hidden the pane has no height; Jump to latest's row is 0.75rem up.
          layout.placement === 'beside' && !collapsed ? 'bottom-4' : 'bottom-[calc(100%+0.75rem)]'
        )}
        style={layout.shift ? { transform: `translateX(-${layout.shift}px)` } : undefined}
      >
        {/* Jump to latest draws here, so the row shares one baseline and one gap. */}
        <div ref={slotRef} data-native-chat-corner-slot className="contents" />
        {onSwitchToTerminal ? (
          <NativeChatViewSwitchButton to="terminal" onSwitch={onSwitchToTerminal} />
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Same launcher treatment as the floating workspace button. */}
            <Button
              type="button"
              variant="launcher"
              size="icon"
              aria-label={label}
              aria-expanded={!collapsed}
              onClick={onToggle}
              className="relative"
            >
              {collapsed ? <PenLine className="size-4" /> : <ChevronsDown className="size-4" />}
              {collapsed && hasPendingDraft ? (
                // Why: a hidden draft is easy to forget; the dot says one is waiting.
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-primary ring-2 ring-card dark:ring-accent"
                />
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {label}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
