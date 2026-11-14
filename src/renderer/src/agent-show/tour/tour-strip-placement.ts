import { STRIP_BOTTOM_GAP_PX } from './tour-strip-spot'

/** The strip's size; where it sits is the dock's (`tour-strip-spot.ts`). */
export type StripSize = {
  width: number
  /** A caption taller than this scrolls inside the strip. */
  maxHeight: number
}

const STRIP_WIDTH_PX = 600
const SIDE_GAP_PX = 16
const MAX_HEIGHT_SHARE = 0.3
const MIN_MAX_HEIGHT_PX = 96

/** The same size whatever the layout: 600 px wide (less on a narrow window). */
export function tourStripSize(window: { width: number; height: number }): StripSize {
  return {
    width: Math.max(0, Math.min(STRIP_WIDTH_PX, window.width - 2 * SIDE_GAP_PX)),
    maxHeight: Math.max(MIN_MAX_HEIGHT_PX, Math.round(window.height * MAX_HEIGHT_SHARE))
  }
}

/** Height the app gives up at its bottom while the strip shows, so nothing the step shows is under it. */
export function tourBandPx(stripHeightPx: number): number {
  return stripHeightPx > 0 ? Math.ceil(stripHeightPx) + 2 * STRIP_BOTTOM_GAP_PX : 0
}

// Why these: the strip's 13 px title and 12 px caption in the app font, its padding, grip and controls.
const TITLE_LINE_PX = 18
const CAPTION_LINE_PX = 16.5
const TITLE_CHAR_PX = 7
const CAPTION_CHAR_PX = 6.2
const CONTROLS_PX = 166
const CHROME_PX = 22

/**
 * The strip's height before it is drawn, from its longest title and caption: the strip keeps the
 * tallest step's height on every step, so the layout under it does not move between steps.
 */
export function estimateStripPx(
  steps: readonly { title: string; caption: string }[],
  rect: StripSize
): number {
  const textWidth = Math.max(1, rect.width - 24)
  const lines = (text: string, charPx: number, width: number): number =>
    Math.max(1, Math.ceil((text.length * charPx) / Math.max(1, width)))
  const title = Math.max(
    0,
    ...steps.map((step) => lines(step.title, TITLE_CHAR_PX, textWidth - CONTROLS_PX))
  )
  const caption = Math.max(
    0,
    ...steps.map((step) => lines(step.caption, CAPTION_CHAR_PX, textWidth))
  )
  return Math.min(
    rect.maxHeight,
    Math.ceil(CHROME_PX + title * TITLE_LINE_PX + caption * CAPTION_LINE_PX)
  )
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
