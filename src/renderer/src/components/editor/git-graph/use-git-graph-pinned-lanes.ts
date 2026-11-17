// Local (glass build): which branches the Git Graph pins to its left, in order (Paweł, 2026-11-17:
// "always show main on the left, then development and then all other branches", "maybe we need
// project specific configs ... or just we could set it in git graph ui"). Untouched, it is the
// repo's main (main, master or trunk) and then its development branch (develop, development or
// dev), whichever exist. An order set in the graph's Lanes menu is kept per project.
import { useCallback, useMemo, useState } from 'react'
import type { GitHistoryItemRef } from '../../../../../shared/git/history/git-history-types'
import { gitGraphBranchName } from './git-graph-lane-names'

const STORAGE_PREFIX = 'orca.gitGraph.pinnedLanes.'
const MAIN_NAMES = ['main', 'master', 'trunk']
const DEVELOP_NAMES = ['develop', 'development', 'dev']

export function defaultGitGraphPinnedLanes(refs: readonly GitHistoryItemRef[]): string[] {
  const names = new Set(
    refs.map((ref) => gitGraphBranchName(ref)).filter((name): name is string => !!name)
  )
  return [MAIN_NAMES, DEVELOP_NAMES]
    .map((candidates) => candidates.find((name) => names.has(name)))
    .filter((name): name is string => !!name)
}

function readSaved(key: string | null): string[] | null {
  if (!key) {
    return null
  }
  try {
    const saved = JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown
    return Array.isArray(saved) && saved.every((name) => typeof name === 'string') ? saved : null
  } catch {
    return null
  }
}

export function useGitGraphPinnedLanes(
  repoKey: string | null,
  refs: readonly GitHistoryItemRef[]
): {
  pinned: string[]
  custom: boolean
  setPinned: (names: string[]) => void
  reset: () => void
} {
  const storageKey = repoKey ? `${STORAGE_PREFIX}${repoKey}` : null
  const [saved, setSaved] = useState<{ key: string | null; names: string[] | null }>(() => ({
    key: storageKey,
    names: readSaved(storageKey)
  }))
  // Another project in the same tab: read its own order.
  const current = saved.key === storageKey ? saved.names : readSaved(storageKey)
  if (saved.key !== storageKey) {
    setSaved({ key: storageKey, names: current })
  }
  const fallback = useMemo(() => defaultGitGraphPinnedLanes(refs), [refs])
  const write = useCallback(
    (names: string[] | null) => {
      setSaved({ key: storageKey, names })
      if (!storageKey) {
        return
      }
      try {
        if (names) {
          window.localStorage.setItem(storageKey, JSON.stringify(names))
        } else {
          window.localStorage.removeItem(storageKey)
        }
      } catch {
        // Storage unavailable: the order lasts for this tab only.
      }
    },
    [storageKey]
  )
  return {
    pinned: current ?? fallback,
    custom: current !== null,
    setPinned: (names) => write(names),
    reset: () => write(null)
  }
}
