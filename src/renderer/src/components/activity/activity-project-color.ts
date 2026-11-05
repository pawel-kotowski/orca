import type React from 'react'
import { useAppStore } from '@/store'
import { projectMatchesRepo } from '../../../../shared/project-repo-match'
import { getProjectIdentityKey } from '../../../../shared/project-host-setup-projection'
import { getProjectHostSetupProjectionFromState } from '@/store/selectors'
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

/**
 * The card's project colour, read live: a thread carries the project as it was when its activity was
 * built, so a colour changed in the project's settings must come from the store, not the thread.
 * Why through the project: a workspace on another machine (a devbox) has that host's own repo
 * record, which keeps the default grey; the colour set in settings lives on the project, which the
 * host's setup links to (as the sidebar groups that workspace under its project).
 */
export function useActivityProjectColor(
  repo: { id: string; badgeColor?: string | null } | null | undefined
): string | null {
  const repoId = repo?.id ?? null
  const project = useAppStore((state) => {
    if (!repoId) {
      return null
    }
    // Every host's setups, as the sidebar's grouping reads them.
    const { projects, setups } = getProjectHostSetupProjectionFromState(state)
    const record = state.repos?.find((entry) => entry.id === repoId)
    const projectId =
      setups.find((setup) => setup.repoId === repoId)?.projectId ??
      projects.find((entry) => projectMatchesRepo(entry, repoId))?.id ??
      (record ? getProjectIdentityKey(record) : undefined)
    return (projectId ? projects.find((entry) => entry.id === projectId) : undefined) ?? null
  })
  const liveBadgeColor = useAppStore((state) =>
    repoId ? state.repos?.find((entry) => entry.id === repoId)?.badgeColor : undefined
  )
  if (!repo) {
    return null
  }
  const projectColor = normalizeRepoBadgeColor(project?.badgeColor)
  const repoColor = liveBadgeColor ?? repo.badgeColor
  // The project's own colour wins; one left grey falls to the repo's, then to a stable pick
  // keyed by the project, so a project's local and remote workspaces share it.
  const badgeColor =
    projectColor && projectColor !== normalizeRepoBadgeColor(DEFAULT_REPO_BADGE_COLOR)
      ? projectColor
      : repoColor
  return activityProjectColor({ id: project?.id ?? repo.id, badgeColor })
}
