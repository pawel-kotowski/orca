// Which transcript rows arrived while the reader had the chat open, so only they fade in.

/** One row's fade: Paweł asked for text that shows up dim and brightens, the same with reduced motion. */
export const NATIVE_CHAT_ROW_ARRIVAL_FADE_MS = 450
/** A row first drawn this long after it arrived (the reader was scrolled away) shows without a fade. */
export const NATIVE_CHAT_ROW_ARRIVAL_WINDOW_MS = 1000

type NativeChatRowArrival = { at: number; shownAt?: number }

/** Per-transcript arrivals, read by each row when it mounts. */
export type NativeChatRowArrivals = { rows: Map<string, NativeChatRowArrival> }

export type NativeChatRowArrivalInput = {
  /** Slot keys in drawing order, rows waiting behind the live turn included. */
  rowKeys: readonly string[]
  /** Every message the transcript holds, drawn or folded, in transcript order. */
  loadedIds: ReadonlySet<string>
  /** The transcript's first read has finished; rows before then are history. */
  settled: boolean
  /** Changes when the transcript is read whole again (another session, a fresh snapshot): its rows
   *  are history too. */
  generation: string
}

export type NativeChatRowArrivalTracker = {
  arrivals: NativeChatRowArrivals
  input: NativeChatRowArrivalInput | null
  /** Messages and rows that never fade: what was there at open, and older pages read in later. */
  history: Set<string>
  /** Message ids the transcript has held. */
  loaded: Set<string>
  /** Row keys the transcript has drawn. */
  drawn: Set<string>
}

export function createNativeChatRowArrivalTracker(): NativeChatRowArrivalTracker {
  return {
    arrivals: { rows: new Map() },
    input: null,
    history: new Set(),
    loaded: new Set(),
    drawn: new Set()
  }
}

function keepOnly(set: Set<string>, ...present: ReadonlySet<string>[]): void {
  for (const key of set) {
    if (!present.some((keys) => keys.has(key))) {
      set.delete(key)
    }
  }
}

/** The nearest earlier key in `order` that `survives`, or null at the start. */
function anchorsOf(
  order: readonly string[],
  survives: (key: string) => boolean
): (string | null)[] {
  let anchor: string | null = null
  return order.map((key) => {
    const own = anchor
    if (survives(key)) {
      anchor = key
    }
    return own
  })
}

/** Rows that left this update, counted at the surviving row each followed: a row that takes one's
 *  place (a pending bubble becoming its transcript row) is a replacement, not an arrival. */
function vacatedPlaces(
  previous: readonly string[],
  current: ReadonlySet<string>
): Map<string | null, number> {
  const places = new Map<string | null, number>()
  const anchors = anchorsOf(previous, (key) => current.has(key))
  previous.forEach((key, index) => {
    if (!current.has(key)) {
      places.set(anchors[index]!, (places.get(anchors[index]!) ?? 0) + 1)
    }
  })
  return places
}

function baseline(state: NativeChatRowArrivalTracker, input: NativeChatRowArrivalInput): void {
  for (const id of input.loadedIds) {
    state.loaded.add(id)
    state.history.add(id)
  }
  for (const key of input.rowKeys) {
    state.drawn.add(key)
    state.history.add(key)
  }
}

/** New messages read in ahead of every message already held are an older page, not news: that
 *  update's new messages and rows are all history. */
function readsOlderPage(
  state: NativeChatRowArrivalTracker,
  loadedIds: ReadonlySet<string>
): boolean {
  for (const id of loadedIds) {
    return !state.loaded.has(id) && state.loaded.size > 0
  }
  return false
}

/**
 * Update once per row change during render, before rows mount; idempotent for the same input.
 * `clock` is read only when the rows changed.
 * A row arrives when its key is drawn for the first time after the first read settled, is not
 * history (on screen at open, or part of an older page), and does not take a departed row's place.
 */
export function trackNativeChatRowArrivals(
  state: NativeChatRowArrivalTracker,
  input: NativeChatRowArrivalInput,
  clock: () => number
): NativeChatRowArrivals {
  const previous = state.input
  if (
    previous &&
    previous.rowKeys === input.rowKeys &&
    previous.loadedIds === input.loadedIds &&
    previous.settled === input.settled &&
    previous.generation === input.generation
  ) {
    return state.arrivals
  }
  state.input = input
  const now = clock()
  const { rows } = state.arrivals
  for (const [key, arrival] of rows) {
    if ((arrival.shownAt ?? arrival.at) + NATIVE_CHAT_ROW_ARRIVAL_WINDOW_MS < now) {
      rows.delete(key)
    }
  }
  const current = new Set(input.rowKeys)
  // A key that left everything (a reused live-row id) may return as a new row.
  keepOnly(state.loaded, input.loadedIds)
  keepOnly(state.drawn, current, input.loadedIds)
  keepOnly(state.history, current, input.loadedIds)
  if (
    !input.settled ||
    !previous?.settled ||
    previous.generation !== input.generation ||
    readsOlderPage(state, input.loadedIds)
  ) {
    baseline(state, input)
    return state.arrivals
  }
  for (const id of input.loadedIds) {
    state.loaded.add(id)
  }
  const vacated = vacatedPlaces(previous.rowKeys, current)
  const before = new Set(previous.rowKeys)
  const anchors = anchorsOf(input.rowKeys, (key) => before.has(key))
  input.rowKeys.forEach((key, index) => {
    if (state.drawn.has(key)) {
      return
    }
    state.drawn.add(key)
    const anchor = anchors[index]!
    const replaces = (vacated.get(anchor) ?? 0) > 0
    if (replaces) {
      vacated.set(anchor, vacated.get(anchor)! - 1)
    }
    // A message held at open and drawn only now (its folded turn opened) is not news.
    if (state.history.has(key) || replaces) {
      state.history.add(key)
      return
    }
    rows.set(key, { at: now })
  })
  return state.arrivals
}

/**
 * How far into its fade a mounting row is, or null for none. The first mount starts the fade;
 * a remount (the window scrolled the row out and back) resumes it, or skips it once it is over.
 */
export function nativeChatRowArrivalFadeElapsed(
  arrivals: NativeChatRowArrivals | undefined,
  key: string,
  now: number
): number | null {
  const arrival = arrivals?.rows.get(key)
  if (!arrival) {
    return null
  }
  if (arrival.shownAt === undefined) {
    if (now - arrival.at > NATIVE_CHAT_ROW_ARRIVAL_WINDOW_MS) {
      return null
    }
    arrival.shownAt = now
  }
  const elapsed = now - arrival.shownAt
  return elapsed < NATIVE_CHAT_ROW_ARRIVAL_FADE_MS ? elapsed : null
}
