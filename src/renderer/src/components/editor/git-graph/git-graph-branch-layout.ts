// Local (glass build): the classic Git Graph's lanes, laid out and coloured by branch (Paweł,
// 2026-11-17: "could we maybe always show main on the left, then development and then all other
// branches? that is a natural project development flow", "development is both blue and yellow").
// A lane is the line to the next commit it reaches, so it takes that commit's branch (its lane
// name): its colour, and its place. Pinned branches (main, then development, by default) sit
// leftmost in their order, every other lane keeps the order it opened in. Colours: pinned
// branches fixed ones, the current branch the text colour, other branches the next palette colour
// in the order they first appear, a line no branch names grey.
import type {
  GitHistoryGraphColorId,
  GitHistoryItem
} from '../../../../../shared/git/history/git-history-types'
import type {
  GitHistoryGraphNode,
  GitHistoryItemViewModel
} from '../../../../../shared/git/history/git-history-graph'

const PALETTE_SIZE = 7
const PINNED_COLOURS = 3

export type GitGraphBranchColours = (branch: string | undefined) => GitHistoryGraphColorId

/** One line of a row's drawing, between lane places: `node` is the commit's dot at mid-row. */
export type GitGraphEdge = {
  from: number | 'node'
  to: number | 'node'
  color: GitHistoryGraphColorId
}

/** A row of the classic graph: the shared view model plus how its lanes connect. */
export type GitGraphLaneRow = GitHistoryItemViewModel & {
  /** The lane place of the commit's dot. */
  circleIndex: number
  nodeColor: GitHistoryGraphColorId
  edges: GitGraphEdge[]
}

export function gitGraphBranchColours(
  items: readonly GitHistoryItem[],
  laneNames: ReadonlyMap<string, string>,
  pinned: readonly string[],
  headBranch: string | undefined
): GitGraphBranchColours {
  const palette = new Map<string, number>()
  for (const item of items) {
    const name = laneNames.get(item.id)
    if (name && name !== headBranch && !pinned.includes(name) && !palette.has(name)) {
      palette.set(name, palette.size % PALETTE_SIZE)
    }
  }
  return (branch) => {
    if (!branch) {
      return 'git-graph-branch-none'
    }
    if (branch === headBranch) {
      return 'git-graph-branch-head'
    }
    const pin = pinned.indexOf(branch)
    if (pin !== -1) {
      return `git-graph-branch-pin-${Math.min(pin, PINNED_COLOURS - 1) + 1}`
    }
    return `git-graph-branch-${(palette.get(branch) ?? 0) + 1}`
  }
}

export function buildGitGraphBranchViewModels(
  items: readonly GitHistoryItem[],
  {
    laneNames,
    pinned,
    colourOf,
    headRevision
  }: {
    laneNames: ReadonlyMap<string, string>
    pinned: readonly string[]
    colourOf: GitGraphBranchColours
    headRevision?: string
  }
): GitGraphLaneRow[] {
  // A lane belongs to the branch whose line it draws: a first-parent lane to its child's branch
  // (a feature's last commit still draws the feature's line down to where it forked off main), a
  // merged parent's lane to that parent's branch. Its colour and place follow that branch.
  type Lane = GitHistoryGraphNode & { branch?: string }
  const lane = (id: string, branch: string | undefined): Lane => ({
    id,
    branch,
    color: colourOf(branch)
  })
  const rank = (entry: Lane): number => {
    const pin = entry.branch === undefined ? -1 : pinned.indexOf(entry.branch)
    return pin === -1 ? pinned.length : pin
  }
  let frontier: Lane[] = []
  const rows: GitGraphLaneRow[] = []
  for (const item of items) {
    const input = frontier
    // Each output lane remembers where it came from: an input place, or the commit's dot.
    const output: { lane: Lane; from: number | 'node' }[] = []
    const [first, ...merged] = item.parentIds
    const branch = laneNames.get(item.id)
    const own = input.findIndex((entry) => entry.id === item.id)
    let firstPlaced = false
    input.forEach((entry, index) => {
      if (entry.id !== item.id) {
        output.push({ lane: entry, from: index })
      } else if (!firstPlaced && first !== undefined) {
        // The commit's own lane goes on to its first parent, in the same place.
        output.push({ lane: lane(first, branch), from: 'node' })
        firstPlaced = true
      }
    })
    if (!firstPlaced && first !== undefined) {
      output.push({ lane: lane(first, branch), from: 'node' })
    }
    for (const parent of merged) {
      output.push({ lane: lane(parent, laneNames.get(parent)), from: 'node' })
    }
    // Stable: lanes of equal rank keep their order, so only a pinned lane moves others aside.
    const placed = output
      .map((entry, index) => ({ ...entry, index, rank: rank(entry.lane) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
    const nodeColor = colourOf(branch)
    // A new tip's dot sits where its first parent's lane leaves, so it needs no bend.
    const firstOut = placed.findIndex((entry) => entry.from === 'node')
    const circleIndex = own !== -1 ? own : firstOut !== -1 ? firstOut : input.length
    const edges: GitGraphEdge[] = []
    input.forEach((entry, index) => {
      if (entry.id === item.id) {
        edges.push({ from: index, to: 'node', color: entry.color })
      }
    })
    placed.forEach((entry, index) => {
      edges.push({ from: entry.from, to: index, color: entry.lane.color })
    })
    frontier = placed.map((entry) => entry.lane)
    rows.push({
      historyItem: item,
      inputSwimlanes: input,
      outputSwimlanes: frontier,
      kind: item.id === headRevision ? 'HEAD' : 'node',
      circleIndex,
      nodeColor,
      edges
    })
  }
  return rows
}
