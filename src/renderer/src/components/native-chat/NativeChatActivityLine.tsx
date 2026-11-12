import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/class-names'

export type NativeChatActivityCell = { key: string; node: ReactNode }

/**
 * One thin line above the message box for one kind of live work (Paweł, 2026-11-10: "one row for
 * shells one for subagents ... many shells in one row until expanded"): its items side by side in
 * the footer's small type in a bordered strip, no header; items share the width (one fills the row:
 * "always use as much as available"). What does not fit stays hidden behind a `+N`; that
 * or a click on the line's empty space wraps them onto as many rows as they need.
 */
export function NativeChatActivityLine({
  kind,
  cells
}: {
  /** Names the line for tests and styles (`data-native-chat-activity-line`). */
  kind: string
  cells: readonly NativeChatActivityCell[]
}): React.JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  const [hidden, setHidden] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }
    const measure = (): void => {
      const items = Array.from(list.children) as HTMLElement[]
      const firstTop = items[0]?.offsetTop ?? 0
      setHidden(items.filter((item) => item.offsetTop > firstTop + 2).length)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    return () => observer.disconnect()
  }, [cells, expanded])
  if (cells.length === 0) {
    return null
  }
  const toggles = expanded || hidden > 0
  return (
    <div
      data-native-chat-activity-line={kind}
      className="shrink-0 bg-chat-pane px-3 pt-1.5 sm:px-4"
    >
      {/* Why the bordered surface: the line sits over the transcript's edge, and over a theme
          image a bare line reads as part of the chat text (Paweł, 2026-11-10). */}
      <div
        data-native-chat-surface="activity-line"
        className="mx-auto flex w-full max-w-(--chat-content-max-width) items-start gap-2 rounded-2xl border px-2.5 py-1 text-2xs text-muted-foreground"
        onClick={(event) => {
          // Why only the line itself: a click on an item opens that item.
          if (toggles && event.target === event.currentTarget) {
            setExpanded(!expanded)
          }
        }}
      >
        <div
          ref={listRef}
          className={cn(
            'flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-0.5',
            expanded ? '' : 'h-4 overflow-hidden'
          )}
          onClick={(event) => {
            if (toggles && event.target === event.currentTarget) {
              setExpanded(!expanded)
            }
          }}
        >
          {cells.map((cell) => (
            <div key={cell.key} className="flex h-4 min-w-0 grow basis-56 items-center">
              {cell.node}
            </div>
          ))}
        </div>
        {toggles ? (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
            className="h-4 shrink-0 cursor-pointer rounded px-1 tabular-nums outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          >
            {expanded ? '−' : `+${hidden}`}
          </button>
        ) : null}
      </div>
    </div>
  )
}
