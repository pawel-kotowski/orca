// Local (glass build): a branch label takes its own branch's lane colour, wherever it sits (a
// label for `development` on a feature's commit is development's colour, not the feature's). A
// name no lane carries (a second name for the same commit, a tag) takes the commit's own colour.
import { createContext, useContext } from 'react'
import type {
  GitHistoryGraphColorId,
  GitHistoryItemRef
} from '../../../../../shared/git/history/git-history-types'
import { gitGraphBranchName } from './git-graph-lane-names'

type BranchColour = (branch: string) => GitHistoryGraphColorId | undefined

const BranchColours = createContext<BranchColour>(() => undefined)
export const GitGraphBranchColoursProvider = BranchColours.Provider

export function useGitGraphBranchColour(): (
  name: string,
  fallback?: GitHistoryGraphColorId
) => GitHistoryGraphColorId | undefined {
  const colourOf = useContext(BranchColours)
  return (name, fallback) => colourOf(name) ?? fallback
}

export function useGitGraphRefColour(
  ref: GitHistoryItemRef,
  fallback?: GitHistoryGraphColorId
): GitHistoryGraphColorId | undefined {
  const colourOf = useContext(BranchColours)
  if (ref.category === 'tags') {
    return undefined
  }
  const name = gitGraphBranchName(ref)
  return (name && colourOf(name)) || fallback
}
