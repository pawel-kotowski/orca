import { describe, expect, it } from 'vitest'
import {
  createNativeChatRowArrivalTracker,
  nativeChatRowArrivalFadeElapsed,
  NATIVE_CHAT_ROW_ARRIVAL_FADE_MS,
  NATIVE_CHAT_ROW_ARRIVAL_WINDOW_MS,
  trackNativeChatRowArrivals,
  type NativeChatRowArrivalTracker
} from './native-chat-row-arrivals'

type Update = { rows: string[]; loaded?: string[]; settled?: boolean; generation?: string }

function track(state: NativeChatRowArrivalTracker, update: Update, now = 0): string[] {
  const arrivals = trackNativeChatRowArrivals(
    state,
    {
      rowKeys: update.rows,
      loadedIds: new Set(update.loaded ?? update.rows),
      settled: update.settled ?? true,
      generation: update.generation ?? 'g1'
    },
    () => now
  )
  return [...arrivals.rows.keys()]
}

describe('row arrivals', () => {
  it('keeps the history on screen at open, loaded before or after the read settles', () => {
    const state = createNativeChatRowArrivalTracker()
    expect(track(state, { rows: ['a'], settled: false })).toEqual([])
    expect(track(state, { rows: ['a', 'b', 'c'] })).toEqual([])
  })

  it('fades rows that arrive after open, at the tail or behind the live turn', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a', 'b'] })
    expect(track(state, { rows: ['a', 'b', 'c'] }, 10)).toEqual(['c'])
    expect(track(state, { rows: ['a', 'b', 'c', 'd', 'queued'] }, 20)).toEqual(['c', 'd', 'queued'])
    // The queued message moving into its turn is the same row, not a second arrival.
    expect(track(state, { rows: ['a', 'b', 'c', 'd', 'e', 'queued'] }, 30)).toEqual([
      'c',
      'd',
      'queued',
      'e'
    ])
  })

  it('does not fade an older page read in ahead of the transcript', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['c', 'd'] })
    expect(track(state, { rows: ['a', 'b', 'c', 'd'] })).toEqual([])
    expect(track(state, { rows: ['a', 'b', 'c', 'd', 'e'] })).toEqual(['e'])
  })

  it('does not fade a row that takes a departed row’s place', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a', 'pending:1'] })
    // The transcript's own user row replaces the pending bubble; the reply after it is news.
    expect(track(state, { rows: ['a', 'user-1', 'reply-1'] })).toEqual(['reply-1'])
  })

  it('does not fade history drawn later, such as a folded turn opened', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a', 'd'], loaded: ['a', 'b', 'c', 'd'] })
    expect(track(state, { rows: ['a', 'b', 'c', 'd'], loaded: ['a', 'b', 'c', 'd'] })).toEqual([])
  })

  it('fades a new message first drawn once it has content', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a'], loaded: ['a'] })
    expect(track(state, { rows: ['a'], loaded: ['a', 'empty-reply'] })).toEqual([])
    expect(track(state, { rows: ['a', 'empty-reply'], loaded: ['a', 'empty-reply'] })).toEqual([
      'empty-reply'
    ])
  })

  it('treats a transcript read whole again as history', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a'] })
    expect(track(state, { rows: ['a', 'b', 'c'], generation: 'g2' })).toEqual([])
    expect(track(state, { rows: ['x'], settled: false, generation: 'g3' })).toEqual([])
    expect(track(state, { rows: ['x', 'y'], generation: 'g3' })).toEqual([])
    expect(track(state, { rows: ['x', 'y', 'z'], generation: 'g3' })).toEqual(['z'])
  })

  it('is idempotent for the same input', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a'] })
    const input = { rowKeys: ['a', 'b'], loadedIds: new Set(['a', 'b']), settled: true }
    const first = trackNativeChatRowArrivals(state, { ...input, generation: 'g1' }, () => 5)
    const again = trackNativeChatRowArrivals(state, state.input!, () => 50)
    expect(again).toBe(first)
    expect(first.rows.get('b')?.at).toBe(5)
  })
})

describe('row arrival fade', () => {
  it('starts on first mount, resumes on a remount, and does not replay', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a'] })
    const arrivals = trackNativeChatRowArrivals(
      state,
      { rowKeys: ['a', 'b'], loadedIds: new Set(['a', 'b']), settled: true, generation: 'g1' },
      () => 1000
    )
    expect(nativeChatRowArrivalFadeElapsed(arrivals, 'a', 1000)).toBeNull()
    expect(nativeChatRowArrivalFadeElapsed(arrivals, 'b', 1040)).toBe(0)
    expect(nativeChatRowArrivalFadeElapsed(arrivals, 'b', 1140)).toBe(100)
    expect(
      nativeChatRowArrivalFadeElapsed(arrivals, 'b', 1040 + NATIVE_CHAT_ROW_ARRIVAL_FADE_MS)
    ).toBeNull()
  })

  it('skips a row first drawn long after it arrived', () => {
    const state = createNativeChatRowArrivalTracker()
    track(state, { rows: ['a'] })
    const arrivals = trackNativeChatRowArrivals(
      state,
      { rowKeys: ['a', 'b'], loadedIds: new Set(['a', 'b']), settled: true, generation: 'g1' },
      () => 0
    )
    expect(
      nativeChatRowArrivalFadeElapsed(arrivals, 'b', NATIVE_CHAT_ROW_ARRIVAL_WINDOW_MS + 1)
    ).toBeNull()
  })
})
