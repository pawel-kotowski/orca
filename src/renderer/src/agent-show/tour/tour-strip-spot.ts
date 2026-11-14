/**
 * Where the user dragged the tour's dock (its pills over its strip): the middle of its bottom edge,
 * as fractions of the window, so a resized window keeps it in the same part of the screen.
 */
export type TourStripSpot = { x: number; y: number }

type Size = { width: number; height: number }
export type DockBox = { left: number; top: number }

/** How far the dock keeps from the window's edges when the user drags it. */
const EDGE_PX = 4
/** The default spot's gap under the strip; a pill alone sits on the status bar's empty middle. */
export const STRIP_BOTTOM_GAP_PX = 8
const PILL_BOTTOM_GAP_PX = 1

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max))

/** The dock's top-left corner: centred near the bottom by default, else at the stored spot, inside the window. */
export function dockBox(
  spot: TourStripSpot | null,
  dock: Size,
  window: Size,
  hasStrip: boolean
): DockBox {
  if (!spot) {
    const gap = hasStrip ? STRIP_BOTTOM_GAP_PX : PILL_BOTTOM_GAP_PX
    return {
      left: Math.round((window.width - dock.width) / 2),
      top: Math.round(window.height - gap - dock.height)
    }
  }
  return clampDockBox(
    { left: spot.x * window.width - dock.width / 2, top: spot.y * window.height - dock.height },
    dock,
    window
  )
}

/** Pulls a box back inside the window, `EDGE_PX` from each edge (the top-left wins when it cannot fit). */
export function clampDockBox(box: DockBox, dock: Size, window: Size): DockBox {
  return {
    left: Math.round(clamp(box.left, EDGE_PX, window.width - dock.width - EDGE_PX)),
    top: Math.round(clamp(box.top, EDGE_PX, window.height - dock.height - EDGE_PX))
  }
}

/** The spot a dock drawn at `box` stands for. */
export function spotOfBox(box: DockBox, dock: Size, window: Size): TourStripSpot {
  return {
    x: clamp((box.left + dock.width / 2) / Math.max(1, window.width), 0, 1),
    y: clamp((box.top + dock.height) / Math.max(1, window.height), 0, 1)
  }
}

export function parseTourStripSpot(raw: string | null): TourStripSpot | null {
  if (!raw) {
    return null
  }
  try {
    const value = JSON.parse(raw) as Partial<TourStripSpot> | null
    const fraction = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1
    return value && fraction(value.x) && fraction(value.y) ? { x: value.x, y: value.y } : null
  } catch {
    return null
  }
}
