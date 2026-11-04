export type CornerRect = { left: number; right: number; top: number; bottom: number }

/** Space between the corner buttons and anything they must not touch. */
export const CORNER_BUTTON_GAP = 8
/** Distance from the pane's right and bottom edges, matching the message box's bottom padding. */
export const CORNER_BUTTON_INSET = 16
/** Height above the message box when the buttons cannot sit beside it. */
export const CORNER_BUTTON_ABOVE_OFFSET = 12

export type CornerButtonsPlacement = 'beside' | 'above'

/** How far left a button at `own` must move to clear the floating workspace launcher, if at all. */
export function floatingLauncherShift(own: CornerRect, launcher: CornerRect | null): number {
  if (!launcher || launcher.right - launcher.left === 0 || launcher.bottom - launcher.top === 0) {
    return 0
  }
  const overlaps =
    own.left < launcher.right + CORNER_BUTTON_GAP &&
    own.right > launcher.left - CORNER_BUTTON_GAP &&
    own.top < launcher.bottom + CORNER_BUTTON_GAP &&
    own.bottom > launcher.top - CORNER_BUTTON_GAP
  return overlaps ? own.right - launcher.left + CORNER_BUTTON_GAP : 0
}

/**
 * Buttons sit at the pane's bottom edge, right of the centred message box, whenever the pane is
 * wide enough to fit them there; only a narrow pane lifts them above the box. `column` is the
 * message box's column, or null while the box is hidden (the corner is then free).
 */
export function resolveCornerButtonsLayout({
  pane,
  column,
  width,
  height,
  launcher
}: {
  pane: CornerRect
  column: CornerRect | null
  width: number
  height: number
  launcher: CornerRect | null
}): { placement: CornerButtonsPlacement; shift: number } {
  const right = pane.right - CORNER_BUTTON_INSET
  const besideBottom = pane.bottom - CORNER_BUTTON_INSET
  const beside = { left: right - width, right, top: besideBottom - height, bottom: besideBottom }
  const besideShift = floatingLauncherShift(beside, launcher)
  if (!column || beside.left - besideShift >= column.right + CORNER_BUTTON_GAP) {
    return { placement: 'beside', shift: besideShift }
  }
  const aboveBottom = pane.top - CORNER_BUTTON_ABOVE_OFFSET
  const above = { left: right - width, right, top: aboveBottom - height, bottom: aboveBottom }
  return { placement: 'above', shift: floatingLauncherShift(above, launcher) }
}
