/**
 * How a fit may scroll: `centre` always recentres; `if-cut` only when the block is not whole;
 * `restore` puts back the place the fit last chose (another reveal just moved it); `none` never.
 */
export type CodeRevealMode = 'centre' | 'if-cut' | 'restore' | 'none'

export type CodeRevealChoice = { kind: 'centre' } | { kind: 'scroll'; scrollTop: number } | null

/** Where a fit scrolls, so a stage editor moves once per show and never by a few px after. */
export function chooseCodeReveal(input: {
  mode: CodeRevealMode
  /** A new font or a new range moves the block, so it is placed again whatever the mode. */
  moved: boolean
  /** The scroll the last placement chose; null before the first. */
  placedScrollTop: number | null
  currentScrollTop: number
  blockShownAt: (scrollTop: number) => boolean
}): CodeRevealChoice {
  const { mode, placedScrollTop } = input
  if (input.moved || mode === 'centre') {
    return { kind: 'centre' }
  }
  if (mode === 'restore') {
    return placedScrollTop !== null && input.blockShownAt(placedScrollTop)
      ? { kind: 'scroll', scrollTop: placedScrollTop }
      : { kind: 'centre' }
  }
  if (mode === 'if-cut') {
    return input.blockShownAt(input.currentScrollTop) ? null : { kind: 'centre' }
  }
  return null
}
