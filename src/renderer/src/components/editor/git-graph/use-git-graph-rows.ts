// Local (glass build): everything the classic Git Graph derives from the loaded history: each
// commit's branch (lane names), the lane colours and places with pinned branches leftmost, author
// colours, and for the Branches view the outline with what each row stands for.
import { useMemo } from 'react'
import type {
  GitHistoryGraphColorId,
  GitHistoryItem,
  GitHistoryResult
} from '../../../../../shared/git/history/git-history-types'
import {
  GIT_GRAPH_DEFAULT_TRUNKS,
  gitGraphLaneNames,
  gitGraphMergedBranchName
} from './git-graph-lane-names'
import { gitGraphEdgeKey, outlineGitGraphItems, type GitGraphOutline } from './git-graph-outline'
import {
  buildGitGraphBranchViewModels,
  gitGraphBranchColours,
  type GitGraphLaneRow
} from './git-graph-branch-layout'
import { gitGraphAuthorHues } from './git-graph-author-color'
import { gitGraphSegments, type GitGraphSegment } from './git-graph-segment-commits'
import { GIT_GRAPH_LANE_WIDTH } from './git-graph-lanes-svg'
import type { GitGraphDensity } from './git-graph-toolbar'

export type GitGraphRows = {
  rows: GitGraphLaneRow[]
  laneNames: Map<string, string>
  itemById: Map<string, GitHistoryItem>
  authorHues: Map<string, number>
  /** A branch's lane colour, or undefined for a name no lane carries. */
  branchColour: (name: string) => GitHistoryGraphColorId | undefined
  /** Any branch's colour as the graph would give it (the Left lanes menu). */
  colourOf: (name: string) => GitHistoryGraphColorId
  outline: GitGraphOutline | null
  /** Branches view: the commits each row stands for, and the branch a merge took in. */
  segmentsOf: (row: GitGraphLaneRow) => GitGraphSegment[]
  mergedNameOf: (row: GitGraphLaneRow) => string | undefined
  /** Branches view: the row a folded commit belongs to. */
  rowOf: Map<string, string>
  graphWidth: number
}

export function useGitGraphRows({
  items,
  result,
  density,
  pinned,
  drawnPinned = []
}: {
  items: GitHistoryItem[]
  result: GitHistoryResult | null
  density: GitGraphDensity
  pinned: string[]
  /** Pinned branches the repo has and the graph draws, loaded yet or not. */
  drawnPinned?: string[]
}): GitGraphRows {
  const headRevision = result?.currentRef?.revision
  const headBranch =
    result?.currentRef?.category === 'branches' ? result.currentRef.name : undefined
  const trunks = useMemo(
    () => [...pinned, ...GIT_GRAPH_DEFAULT_TRUNKS.filter((name) => !pinned.includes(name))],
    [pinned]
  )
  const laneNames = useMemo(() => gitGraphLaneNames(items, trunks), [items, trunks])
  const authorHues = useMemo(() => gitGraphAuthorHues(items), [items])
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const colourOf = useMemo(
    () => gitGraphBranchColours(items, laneNames, pinned, headBranch),
    [headBranch, items, laneNames, pinned]
  )
  const laneBranches = useMemo(() => new Set(laneNames.values()), [laneNames])
  const outline = useMemo(
    () => (density === 'branches' ? outlineGitGraphItems(items, headRevision) : null),
    [density, headRevision, items]
  )
  const rows = useMemo(
    () =>
      result
        ? buildGitGraphBranchViewModels(outline?.items ?? items, {
            laneNames,
            pinned,
            colourOf,
            headRevision,
            drawn: drawnPinned
          })
        : [],
    [colourOf, drawnPinned, headRevision, items, laneNames, outline, pinned, result]
  )
  const rowOf = useMemo(() => {
    const owners = new Map<string, string>()
    for (const [edge, ids] of outline?.foldedByEdge ?? []) {
      const child = edge.slice(0, edge.indexOf('>'))
      for (const id of ids) {
        owners.set(id, child)
      }
    }
    return owners
  }, [outline])
  const graphWidth = useMemo(
    () =>
      rows.reduce(
        (max, row) =>
          Math.max(
            max,
            GIT_GRAPH_LANE_WIDTH *
              (Math.max(
                row.inputSwimlanes.length,
                row.outputSwimlanes.length,
                row.circleIndex + 1
              ) +
                1)
          ),
        GIT_GRAPH_LANE_WIDTH * 2
      ),
    [rows]
  )
  const mergedNameOf = (row: GitGraphLaneRow): string | undefined => {
    const merged = row.historyItem.parentIds[1]
    if (!merged) {
      return undefined
    }
    // The first commit the merge took in carries the merged branch's name.
    const firstIn = outline?.foldedByEdge.get(gitGraphEdgeKey(row.historyItem.id, merged))?.[0]
    return gitGraphMergedBranchName(row.historyItem.subject) ?? laneNames.get(firstIn ?? merged)
  }
  return {
    rows,
    laneNames,
    itemById,
    authorHues,
    branchColour: (name) => (laneBranches.has(name) ? colourOf(name) : undefined),
    colourOf: (name) => colourOf(name),
    outline,
    segmentsOf: (row) =>
      gitGraphSegments(
        row.historyItem,
        outline?.foldedByEdge ?? new Map(),
        laneNames.get(row.historyItem.id),
        mergedNameOf(row)
      ),
    mergedNameOf,
    rowOf,
    graphWidth
  }
}
