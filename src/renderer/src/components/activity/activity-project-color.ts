import type React from 'react'
import {
  DEFAULT_REPO_BADGE_COLOR,
  normalizeRepoBadgeColor,
  REPO_COLORS
} from '../../../../shared/repo-badge-color'

// The palette's colours, without its neutral grey: a grey tells the cards apart no better than none.
const PICKED_COLORS = REPO_COLORS.filter((color) => color !== DEFAULT_REPO_BADGE_COLOR)

function stableIndex(key: string, size: number): number {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619)
  }
  // Why MurmurHash3's finalizer: FNV alone left similar ids on two colours.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16
  return (hash >>> 0) % size
}

/**
 * A project's card colour: the one set in its settings (the project → Color), else a stable one
 * from the project palette, so cards of different projects differ at a glance without any setup
 * (Paweł, 2026-11-05: every project still had the default grey, so no card showed a colour).
 * Null for a card with no project (the floating workspace).
 */
export function activityProjectColor(
  repo: { id: string; badgeColor?: string | null } | null | undefined
): string | null {
  if (!repo) {
    return null
  }
  const color = normalizeRepoBadgeColor(repo.badgeColor)
  if (color && color !== normalizeRepoBadgeColor(DEFAULT_REPO_BADGE_COLOR)) {
    return color
  }
  return PICKED_COLORS[stableIndex(repo.id, PICKED_COLORS.length)] ?? null
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
