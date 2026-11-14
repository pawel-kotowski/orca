import { parseTourStripSpot, type TourStripSpot } from './tour-strip-spot'

// Why one key: tours play only in the app window, and localStorage outlives reloads and restarts.
const STORAGE_KEY = 'orca.agentShow.tourStripSpot.v1'

const listeners = new Set<() => void>()
let loaded = false
let current: TourStripSpot | null = null

/** Where the user put the tour strip; null while it sits at its default spot. */
export function tourStripSpot(): TourStripSpot | null {
  if (!loaded) {
    loaded = true
    try {
      current = parseTourStripSpot(localStorage.getItem(STORAGE_KEY))
    } catch {
      current = null
    }
  }
  return current
}

/** Stores a dragged spot, or null to put the strip back at its default spot. */
export function setTourStripSpot(spot: TourStripSpot | null): void {
  loaded = true
  current = spot
  try {
    if (spot) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(spot))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // Why: a full or blocked storage only costs the spot after a restart.
  }
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeTourStripSpot(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
