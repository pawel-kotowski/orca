// Local (glass build): how much room sits between the Git Graph's commit rows (Paweł, 2026-11-27:
// "add option to increase distance between lines for clarity", then "i meant space between commit
// msgs not branch lines"). The toolbar's Rows switch adds the space half above and half below each
// commit, in every view; the branch lines run through it unbroken. Remembered for every graph.
import { createContext, useCallback, useContext, useState } from 'react'

export const GIT_GRAPH_ROW_SPACINGS = [
  { space: 0, label: 'Close', title: 'Commits close together, as before' },
  { space: 8, label: 'Wide', title: 'More room between commits' },
  { space: 16, label: 'Wider', title: 'The most room between commits' }
] as const

const STORAGE_KEY = 'orca.gitGraph.rowSpacing'

export function useGitGraphRowSpacing(): [number, (space: number) => void] {
  const [space, setSpace] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(STORAGE_KEY))
      return GIT_GRAPH_ROW_SPACINGS.some((spacing) => spacing.space === stored) ? stored : 0
    } catch {
      return 0
    }
  })
  const choose = useCallback((next: number) => {
    setSpace(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // The choice lasts for this tab only.
    }
  }, [])
  return [space, choose]
}

const RowSpacing = createContext(0)
export const GitGraphRowSpacingProvider = RowSpacing.Provider

/** The extra room above and below each commit row, in pixels. */
export function useGitGraphRowSpace(): { above: number; below: number } {
  const space = useContext(RowSpacing)
  return { above: space / 2, below: space / 2 }
}
