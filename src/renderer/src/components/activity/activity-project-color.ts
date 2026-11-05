import type React from 'react'
import {
  DEFAULT_REPO_BADGE_COLOR,
  normalizeRepoBadgeColor
} from '../../../../shared/repo-badge-color'

/**
 * The project's own colour (Settings → the project → Color), or null while it keeps the default
 * grey: a grey every project shares tells the cards apart no better than none.
 */
export function activityProjectColor(badgeColor: string | null | undefined): string | null {
  const color = normalizeRepoBadgeColor(badgeColor)
  return color && color !== normalizeRepoBadgeColor(DEFAULT_REPO_BADGE_COLOR) ? color : null
}

/**
 * A delicate wash of the project's colour over the card. Why a background image: hover, open and
 * selected states paint the background colour, and the wash must sit over them, not replace them.
 */
export function activityCardTintStyle(color: string | null): React.CSSProperties | undefined {
  if (!color) {
    return undefined
  }
  const wash = `color-mix(in srgb, ${color} 9%, transparent)`
  return { backgroundImage: `linear-gradient(${wash}, ${wash})` }
}

/** The repo tag in the project's colour: a clear fill and full-strength text. */
export function activityRepoTagStyle(color: string | null): React.CSSProperties | undefined {
  if (!color) {
    return undefined
  }
  return {
    backgroundColor: `color-mix(in srgb, ${color} 30%, transparent)`,
    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 55%, transparent)`
  }
}
