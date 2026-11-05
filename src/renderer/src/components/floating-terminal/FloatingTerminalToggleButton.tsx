import { useTranslation } from 'react-i18next'
import { useLayoutEffect, useState } from 'react'
import { PanelsTopLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FloatingTerminalIconContextMenu } from './FloatingTerminalIconContextMenu'
import { useShortcutLabel } from '@/hooks/useShortcutLabel'
import { useAppStore } from '@/store'
import { selectFloatingWorkspaceHasUnread } from '@/store/selectors'
import { translate } from '@/i18n/i18n'

// Paweł, 2026-11-05: the launcher sits in the bottom-right corner, always, the same small gap from
// the right edge and from the status bar. It no longer drags or remembers a dropped position.
const LAUNCHER_EDGE_GAP = 6
// The status bar's height (h-6) until it has drawn and can be measured.
const STATUS_BAR_DEFAULT_HEIGHT = 24

/** The launcher's gap from the window's bottom: above the status bar when it shows. */
function useLauncherBottom(statusBarVisible: boolean): number {
  const [bottom, setBottom] = useState(
    LAUNCHER_EDGE_GAP + (statusBarVisible ? STATUS_BAR_DEFAULT_HEIGHT : 0)
  )
  useLayoutEffect(() => {
    let resizeObserver: ResizeObserver | null = null
    let mutationObserver: MutationObserver | null = null
    const measure = (): void => {
      const bar = statusBarVisible
        ? document.querySelector<HTMLElement>('[data-orca-status-bar]')
        : null
      setBottom(LAUNCHER_EDGE_GAP + (bar ? bar.getBoundingClientRect().height : 0))
      if (bar && !resizeObserver) {
        resizeObserver = new ResizeObserver(measure)
        resizeObserver.observe(bar)
        mutationObserver?.disconnect()
        mutationObserver = null
      }
    }
    measure()
    // Why: the status bar is a lazy chunk; watch for it to arrive, then only for its size.
    if (statusBarVisible && !resizeObserver) {
      mutationObserver = new MutationObserver(measure)
      mutationObserver.observe(document.body, { childList: true, subtree: true })
    }
    window.addEventListener('resize', measure)
    return () => {
      resizeObserver?.disconnect()
      mutationObserver?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [statusBarVisible])
  return bottom
}

export function FloatingTerminalToggleButton({
  open,
  onToggle
}: {
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  // Memoized: subscribe so a language change still repaints its labels.
  useTranslation()
  const shortcutLabel = useShortcutLabel('floatingTerminal.toggle')
  // Read shared unread state so engaging with or closing a tab clears its minimized-panel attention dot.
  const hasFloatingUnread = useAppStore(selectFloatingWorkspaceHasUnread)
  const showAttentionDot = !open && hasFloatingUnread
  const statusBarVisible = useAppStore((state) => state.statusBarVisible !== false)
  const bottom = useLauncherBottom(statusBarVisible)

  return (
    <FloatingTerminalIconContextMenu
      currentLocation="floating-button"
      // Keep the toggle above the panel so overlapping areas remain clickable.
      className="fixed z-[46]"
      style={{ right: LAUNCHER_EDGE_GAP, bottom }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="launcher"
            size="icon"
            className="relative hover:-translate-y-0.5 active:translate-y-0"
            data-floating-terminal-toggle
            aria-label={
              open
                ? translate(
                    'auto.components.floating.terminal.FloatingTerminalToggleButton.5785dd9148',
                    'Minimize floating workspace'
                  )
                : showAttentionDot
                  ? translate(
                      'auto.components.floating.terminal.FloatingTerminalToggleButton.4cb418b991',
                      'Show floating workspace, new activity'
                    )
                  : translate(
                      'auto.components.floating.terminal.FloatingTerminalToggleButton.3b04b065b5',
                      'Show floating workspace'
                    )
            }
            aria-pressed={open}
            onClick={onToggle}
          >
            <PanelsTopLeft className="size-4" />
            {showAttentionDot ? (
              // Match unread attention color; match the ring to the button fill so the dot stays legible in both themes.
              <span
                aria-hidden
                data-floating-terminal-attention
                className="pointer-events-none absolute right-1 top-1 size-2 rounded-full bg-amber-500 ring-2 ring-card dark:ring-accent"
              />
            ) : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={6}>
          {translate(
            'auto.components.floating.terminal.FloatingTerminalToggleButton.bfe7809a70',
            '{{value0}} floating workspace ({{value1}})',
            { value0: open ? 'Minimize' : 'Show', value1: shortcutLabel }
          )}
        </TooltipContent>
      </Tooltip>
    </FloatingTerminalIconContextMenu>
  )
}
