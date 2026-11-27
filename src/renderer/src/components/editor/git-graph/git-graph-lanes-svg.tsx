// Local (glass build): one row of the classic Git Graph, drawn from the row's edges
// (git-graph-branch-layout.ts). Unlike the sidebar's drawing it lets a lane change place between
// rows, which pinning main and development to the left needs: a lane that moves bends smoothly
// to its new place. Lane places, the dot's size and the 24px row match the sidebar's look.
import React, { createContext, useCallback, useContext, useState } from 'react'
import { graphColor } from '@/components/right-sidebar/source-control/sync/git-history-graph-svg'
import type { GitGraphLaneRow } from './git-graph-branch-layout'

export const GIT_GRAPH_LANE_WIDTH = 11

/**
 * How far apart the lines sit (Paweł, 2026-11-27: "add option to increase distance between lines
 * for clarity"): the toolbar's Lines switch, remembered for every graph.
 */
export const GIT_GRAPH_LANE_SPACINGS = [
  { width: GIT_GRAPH_LANE_WIDTH, label: 'Close', title: 'Lines close together, as before' },
  { width: 16, label: 'Wide', title: 'More room between the lines' },
  { width: 22, label: 'Wider', title: 'The most room between the lines' }
] as const
const SPACING_STORAGE_KEY = 'orca.gitGraph.laneWidth'

export function useGitGraphLaneWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(SPACING_STORAGE_KEY))
      return GIT_GRAPH_LANE_SPACINGS.some((spacing) => spacing.width === stored)
        ? stored
        : GIT_GRAPH_LANE_WIDTH
    } catch {
      return GIT_GRAPH_LANE_WIDTH
    }
  })
  const choose = useCallback((next: number) => {
    setWidth(next)
    try {
      window.localStorage.setItem(SPACING_STORAGE_KEY, String(next))
    } catch {
      // The choice lasts for this tab only.
    }
  }, [])
  return [width, choose]
}

const LaneWidth = createContext(GIT_GRAPH_LANE_WIDTH)
export const GitGraphLaneWidthProvider = LaneWidth.Provider
export function useGitGraphLaneWidthContext(): number {
  return useContext(LaneWidth)
}
const HEIGHT = 24
const MID = HEIGHT / 2
const RADIUS = 3.5

/** The current branch's line is drawn a little heavier, so it reads as "you are here". */
export function gitGraphLaneStroke(color: string): number {
  return color === 'git-graph-branch-head' ? 2.25 : 1.5
}

const placeX =
  (lane: number) =>
  (place: number): number =>
    lane * (place + 1)

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) {
    return `M ${x1} ${y1} V ${y2}`
  }
  const bend = (y2 - y1) / 2
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
}

export function GitGraphLanesSvg({ row }: { row: GitGraphLaneRow }): React.JSX.Element {
  const x = placeX(useGitGraphLaneWidthContext())
  const places = Math.max(
    row.inputSwimlanes.length,
    row.outputSwimlanes.length,
    row.circleIndex + 1
  )
  const width = x(places)
  const cx = x(row.circleIndex)
  const isMerge = row.historyItem.parentIds.length > 1
  const dot = graphColor(row.nodeColor)
  return (
    <svg
      aria-hidden
      className="shrink-0 overflow-visible"
      width={width}
      height={HEIGHT}
      viewBox={`0 0 ${width} ${HEIGHT}`}
    >
      {row.edges.map((edge, index) => {
        const [x1, y1] = edge.from === 'node' ? [cx, MID] : [x(edge.from), 0]
        const [x2, y2] = edge.to === 'node' ? [cx, MID] : [x(edge.to), HEIGHT]
        return (
          <path
            key={index}
            d={edgePath(x1, y1, x2, y2)}
            fill="none"
            stroke={graphColor(edge.color)}
            strokeLinecap="round"
            strokeWidth={gitGraphLaneStroke(edge.color)}
          />
        )
      })}
      {row.kind === 'HEAD' ? (
        <>
          <circle
            cx={cx}
            cy={MID}
            r={RADIUS + 3}
            fill={dot}
            stroke="var(--background)"
            strokeWidth={1.5}
          />
          <circle cx={cx} cy={MID} r={1.5} fill="var(--background)" />
        </>
      ) : isMerge ? (
        <>
          <circle cx={cx} cy={MID} r={RADIUS + 1} fill={dot} />
          <circle cx={cx} cy={MID} r={RADIUS - 1.5} fill="var(--background)" />
        </>
      ) : (
        <circle cx={cx} cy={MID} r={RADIUS} fill={dot} />
      )}
    </svg>
  )
}
