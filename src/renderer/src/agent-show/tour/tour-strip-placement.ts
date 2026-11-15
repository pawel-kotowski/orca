/** The strip's size; where it sits is the dock's (`tour-strip-spot.ts`). */
export type StripSize = {
  width: number
  /** A caption taller than this scrolls inside the strip. */
  maxHeight: number
}

const STRIP_WIDTH_PX = 720
const SIDE_GAP_PX = 16
const MAX_HEIGHT_SHARE = 0.3
const MIN_MAX_HEIGHT_PX = 96

/** The same size whatever the layout: 720 px wide (less on a narrow window), a readable line at the 15 px caption. */
export function tourStripSize(window: { width: number; height: number }): StripSize {
  return {
    width: Math.max(0, Math.min(STRIP_WIDTH_PX, window.width - 2 * SIDE_GAP_PX)),
    maxHeight: Math.max(MIN_MAX_HEIGHT_PX, Math.round(window.height * MAX_HEIGHT_SHARE))
  }
}

/**
 * The tour whose workspace is on screen gets the strip (one: it has one place); every other tour
 * waits as a pill that goes back to its workspace.
 */
export function stripAndPills<T>(
  tours: readonly T[],
  drawn: (tour: T) => boolean
): { strip: T | undefined; pills: T[] } {
  const strip = tours.find(drawn)
  return { strip, pills: tours.filter((tour) => tour !== strip) }
}
