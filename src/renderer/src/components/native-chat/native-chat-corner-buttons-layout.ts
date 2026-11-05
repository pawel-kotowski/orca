export type CornerRect = { left: number; right: number; top: number; bottom: number }

/** Space between the corner buttons and anything they must not touch. */
export const CORNER_BUTTON_GAP = 8

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
