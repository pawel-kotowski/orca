// Local (glass build): the classic Git Graph's lanes, laid out and coloured by branch (Paweł,
// 2026-11-17: "could we maybe always show main on the left, then development and then all other
// branches? that is a natural project development flow", "development is both blue and yellow").
// A lane is the line to the next commit it reaches, so it takes that commit's branch (its lane
// name): its colour, and its place. Pinned branches (main, then development, by default) sit
// leftmost in their order, each in a column of its own from the top of the graph, and every other
// lane keeps the order it opened in to the right of them. Colours: pinned
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

/** A reserved column above its pinned branch's tip: drawn as nothing, matched by no commit. */
export const GIT_GRAPH_EMPTY_LANE = '\0empty'
export const GIT_GRAPH_EMPTY_COLOR: GitHistoryGraphColorId = 'git-graph-branch-empty'
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
    headRevision,
    drawn = []
  }: {
    laneNames: ReadonlyMap<string, string>
    pinned: readonly string[]
    colourOf: GitGraphBranchColours
    headRevision?: string
    /** Pinned branches the graph draws though their tips may not be loaded yet. */
    drawn?: readonly string[]
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
  // Paweł, 2026-11-17: "when main is behind then above it all branches should start one col to
  // the right, not curve into free slot". Every pinned branch the loaded history holds owns its
  // column from the top: above its tip the column stays empty, so other branches never shift. A
  // drawn branch whose tip is pages away keeps its column too, so loading it moves nothing.
  const present = new Set(laneNames.values())
  const reserved = pinned.filter((name) => present.has(name) || drawn.includes(name))
  const empty = (): Lane => ({ id: GIT_GRAPH_EMPTY_LANE, color: GIT_GRAPH_EMPTY_COLOR })
  let frontier: Lane[] = []
  const rows: GitGraphLaneRow[] = []
  for (const item of items) {
    const input = frontier
    // Each output lane remembers where it came from: an input place, or the commit's dot.
    const output: { lane: Lane; from: number | 'node'; first?: true }[] = []
    const [first, ...merged] = item.parentIds
    const branch = laneNames.get(item.id)
    const own = input.findIndex((entry) => entry.id === item.id)
    let firstPlaced = false
    input.forEach((entry, index) => {
      if (entry.id === GIT_GRAPH_EMPTY_LANE) {
        return
      }
      if (entry.id !== item.id) {
        output.push({ lane: entry, from: index })
      } else if (!firstPlaced && first !== undefined) {
        // The commit's own lane goes on to its first parent, in the same place.
        output.push({ lane: lane(first, branch), from: 'node', first: true })
        firstPlaced = true
      }
    })
    if (!firstPlaced && first !== undefined) {
      output.push({ lane: lane(first, branch), from: 'node', first: true })
    }
    for (const parent of merged) {
      output.push({ lane: lane(parent, laneNames.get(parent)), from: 'node' })
    }
    // A pinned branch's first lane takes its reserved column; everything else (other branches, a
    // pinned branch's extra lanes) follows the reserved block in the order it opened in.
    // Paweł, 2026-11-20: "should test tip be shown on the right? its pinned to left". A merge of
    // an older commit of a pinned branch (a feature merging test before test moved on) opens a
    // lane in that branch's name, which reached the column first and pushed the branch's own tip
    // to the right. So the commit's own line takes its column ahead of lines passing by, and a
    // passing line bound for the same commit joins it there instead of running beside it.
    type Placed = { lane: Lane; from: number | 'node' | 'none'; first?: true }
    const slots: (Placed | undefined)[] = reserved.map(() => undefined)
    const rest: Placed[] = []
    const joins: GitGraphEdge[] = []
    const slotOf = (entry: Placed): number =>
      entry.lane.branch === undefined ? -1 : reserved.indexOf(entry.lane.branch)
    const ownLine = output.find((entry) => entry.first)
    if (ownLine && slotOf(ownLine) !== -1) {
      slots[slotOf(ownLine)] = ownLine
    }
    for (const entry of output) {
      if (slots.includes(entry)) {
        continue
      }
      const slot = slotOf(entry)
      if (slot === -1) {
        rest.push(entry)
      } else if (!slots[slot]) {
        slots[slot] = entry
      } else if (slots[slot]!.lane.id === entry.lane.id && entry.from !== 'node') {
        joins.push({ from: entry.from, to: slot, color: entry.lane.color })
      } else {
        rest.push(entry)
      }
    }
    const placed: Placed[] = [
      ...slots.map((entry) => entry ?? { lane: empty(), from: 'none' as const }),
      ...rest
    ]
    const nodeColor = colourOf(branch)
    // The dot sits where the commit's own line goes on (its first parent's column): a pinned
    // branch's commit in its column even where other lines ran into it, a new tip without a bend.
    const firstOut = placed.findIndex((entry) => entry.first)
    const circleIndex = firstOut !== -1 ? firstOut : own !== -1 ? own : input.length
    const edges: GitGraphEdge[] = []
    input.forEach((entry, index) => {
      if (entry.id === item.id) {
        edges.push({ from: index, to: 'node', color: entry.color })
      }
    })
    placed.forEach((entry, index) => {
      if (entry.from !== 'none') {
        edges.push({ from: entry.from, to: index, color: entry.lane.color })
      }
    })
    edges.push(...joins)
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
