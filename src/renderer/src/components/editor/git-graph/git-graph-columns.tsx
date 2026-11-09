// Local (glass build): the Git Graph tab's resizable columns. Graph, Author, Date and Commit take
// the widths you drag them to (saved per machine); Description takes the rest. When the tab is too
// narrow, Author drops first, then Date, so the description always shows.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type GitGraphColumnKey = 'graph' | 'author' | 'date' | 'commit'

/** `graph: null` means "as wide as the widest row's lanes". */
export type GitGraphColumnWidths = {
  graph: number | null
  author: number
  date: number
  commit: number
}

export type GitGraphLayout = {
  graph: number
  author: boolean
  date: boolean
  widths: GitGraphColumnWidths
  template: string
}

const DEFAULT_WIDTHS: GitGraphColumnWidths = { graph: null, author: 160, date: 128, commit: 72 }
const STORAGE_KEY = 'orca.gitGraph.columnWidths'
const MIN_WIDTH = 40
const MAX_WIDTH = 720
const MIN_DESCRIPTION = 240
const GAP = 12

function readWidths(): GitGraphColumnWidths {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as unknown
    if (saved && typeof saved === 'object') {
      return { ...DEFAULT_WIDTHS, ...(saved as Partial<GitGraphColumnWidths>) }
    }
  } catch {
    // Unreadable or unavailable storage: defaults.
  }
  return DEFAULT_WIDTHS
}

export function clampGitGraphColumnWidth(width: number): number {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)))
}

export function gitGraphLayout(
  widths: GitGraphColumnWidths,
  listWidth: number,
  lanesWidth: number
): GitGraphLayout {
  const graph = widths.graph ?? lanesWidth
  const fixed = graph + widths.commit + MIN_DESCRIPTION + GAP * 2 + 12
  const date = listWidth >= fixed + widths.date + GAP
  const author = date && listWidth >= fixed + widths.date + widths.author + GAP * 2
  const template = [
    `${graph}px`,
    'minmax(0,1fr)',
    ...(author ? [`${widths.author}px`] : []),
    ...(date ? [`${widths.date}px`] : []),
    `${widths.commit}px`
  ].join(' ')
  return { graph, author, date, widths, template }
}

export function useGitGraphColumns(
  listWidth: number,
  lanesWidth: number
): {
  layout: GitGraphLayout
  setWidth: (key: GitGraphColumnKey, width: number) => void
  resetWidth: (key: GitGraphColumnKey) => void
} {
  const [widths, setWidths] = useState(readWidths)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
      } catch {
        // Storage unavailable: widths last for this tab only.
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [widths])
  const setWidth = useCallback((key: GitGraphColumnKey, width: number) => {
    setWidths((prev) => ({ ...prev, [key]: clampGitGraphColumnWidth(width) }))
  }, [])
  const resetWidth = useCallback((key: GitGraphColumnKey) => {
    setWidths((prev) => ({ ...prev, [key]: DEFAULT_WIDTHS[key] }))
  }, [])
  const layout = useMemo(
    () => gitGraphLayout(widths, listWidth, lanesWidth),
    [lanesWidth, listWidth, widths]
  )
  return { layout, setWidth, resetWidth }
}

/** A drag handle on a header cell's edge. `edge: 'left'` widens the column as it moves left. */
export function GitGraphColumnResizeHandle({
  edge,
  width,
  label,
  onResize,
  onReset
}: {
  edge: 'left' | 'right'
  width: number
  label: string
  onResize: (width: number) => void
  onReset: () => void
}): React.JSX.Element {
  const dragRef = useRef<{ x: number; width: number } | null>(null)
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={`${label} (double click: reset)`}
      className={`absolute top-0 z-10 h-full w-2 cursor-col-resize touch-none after:absolute after:inset-y-1 after:left-1/2 after:w-px after:bg-border hover:after:bg-ring ${
        edge === 'right' ? '-right-[10px]' : '-left-[10px]'
      }`}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = { x: event.clientX, width }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!drag) {
          return
        }
        const delta = event.clientX - drag.x
        onResize(edge === 'right' ? drag.width + delta : drag.width - delta)
      }}
      onPointerUp={() => {
        dragRef.current = null
      }}
      onPointerCancel={() => {
        dragRef.current = null
      }}
      onDoubleClick={onReset}
    />
  )
}
