const BAND_ATTRIBUTE = 'data-orca-tour-band'
const BAND_VARIABLE = '--orca-tour-band'

/** The app ends above the band, so panes, the chat and its message box are never under the strip. */
export const TOUR_BAND_RULE = `html[${BAND_ATTRIBUTE}] .app-layout { padding-bottom: var(${BAND_VARIABLE}); }`

/** Reserves `px` at the bottom of the window for the strip; 0 gives it back. */
export function setTourBand(px: number): void {
  const root = document.documentElement
  if (px <= 0) {
    root.removeAttribute(BAND_ATTRIBUTE)
    root.style.removeProperty(BAND_VARIABLE)
    return
  }
  const value = `${px}px`
  if (root.style.getPropertyValue(BAND_VARIABLE) !== value) {
    root.style.setProperty(BAND_VARIABLE, value)
  }
  root.setAttribute(BAND_ATTRIBUTE, '')
}

export function tourBandDrawnPx(): number {
  const root = document.documentElement
  return root.hasAttribute(BAND_ATTRIBUTE)
    ? Number.parseFloat(root.style.getPropertyValue(BAND_VARIABLE)) || 0
    : 0
}
