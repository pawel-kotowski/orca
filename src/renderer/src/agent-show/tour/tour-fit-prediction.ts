import {
  codeColumnsAtFloor,
  codeFontFloor,
  codeLineHeightAt,
  fitCodeFont,
  stackPaneShares,
  type CodeTypography
} from '../code/code-fit'
import {
  CHAT_SHARE_BESIDE_STAGE,
  GUTTER_PX,
  MIN_CHAT_WIDTH_PX,
  MIN_SPLIT_RIGHT_COLUMNS,
  MIN_STAGE_COLUMNS,
  noteCardPx,
  PANE_CHROME_PX
} from '../code/code-stage-room'
import { stageFoldsRightSidebar } from '../code/code-stage-explorer'
import { stepEntryClears, stepRequests, type TourStep } from './tour-steps'
import {
  describeCut,
  describeNarrow,
  describeOffScreen,
  describeReused
} from './tour-step-problems'

/** The window as the check measured it. */
export type PredictionGeometry = {
  /** The chat's pane, and the stage column beside it (0 when there is none yet). */
  ownerWidthPx: number
  stageWidthPx: number
  /** The stage column's height (the chat pane's when none), tab strips included. */
  heightPx: number
  /** The right sidebar; `tab` decides whether the stage may fold it. */
  explorer: { open: boolean; widthPx: number; tab?: string }
  projectList: { open: boolean; widthPx: number }
  user: CodeTypography
  /** Monaco's derived line height per px of font. */
  lineHeightRatio: number
  wordWrap: boolean
}

/** The characters of each line of a file's range, or null when the file could not be read. */
export type RangeLineLengths = (
  filePath: string,
  startLine: number,
  endLine: number
) => readonly number[] | null

export type StepPrediction = {
  problems: string[]
  /** What the check cannot foresee, measured when the user reaches the step. */
  unpredicted: string[]
}

type CodeShow = Extract<TourStep['requests'][number], { kind: 'code' }>
type Pane = { column: number; shows: CodeShow[] }

// Why 14: Monaco's vertical scrollbar takes that much of a pane's text width.
const SCROLLBAR_PX = 14
const CHAR_EM = 0.6

function lineHeightAt(fontSize: number, geometry: PredictionGeometry): number {
  return codeLineHeightAt(fontSize, geometry.user, geometry.lineHeightRatio)
}

/** Rows each line of the show's range takes in a pane `widthPx` wide at `fontSize`. */
function rowsOf(
  show: CodeShow,
  widthPx: number,
  fontSize: number,
  geometry: PredictionGeometry,
  lengths: RangeLineLengths
): number[] {
  const { startLine, endLine } = show.range
  const chars = lengths(show.filePath, startLine, endLine)
  const count = endLine - startLine + 1
  if (!chars || !geometry.wordWrap) {
    return Array.from({ length: count }, () => 1)
  }
  const perRow = Math.max(1, (widthPx - GUTTER_PX - SCROLLBAR_PX) / (fontSize * CHAR_EM))
  return Array.from({ length: count }, (_, i) => Math.max(1, Math.ceil((chars[i] ?? 0) / perRow)))
}

/** The range a pane fits: its marks on the front file together, as the editor tries first. */
function spanOf(shows: readonly CodeShow[]): CodeShow {
  const last = shows.at(-1)!
  return {
    ...last,
    range: {
      startLine: Math.min(...shows.map((show) => show.range.startLine)),
      endLine: Math.max(...shows.map((show) => show.range.endLine))
    }
  }
}

function notesPx(shows: readonly CodeShow[]): number {
  return shows.reduce((sum, show) => sum + noteCardPx(show.note), 0)
}

type PaneFit = { fits: boolean; linesVisible: number; rangeLines: number }

/** The largest font from the user's to the floor at which `target` and its notes fit, as the editor picks. */
function fitInPane(
  target: CodeShow,
  notes: number,
  pane: { widthPx: number; heightPx: number },
  geometry: PredictionGeometry,
  lengths: RangeLineLengths
): PaneFit {
  const { user, lineHeightRatio } = geometry
  const availablePx =
    pane.heightPx - PANE_CHROME_PX - Math.round(lineHeightRatio * user.fontSize * 0.5)
  const rowsAt = (fontSize: number): number[] =>
    rowsOf(target, pane.widthPx, fontSize, geometry, lengths)
  const choice = fitCodeFont({
    availablePx,
    user,
    autoLineHeightRatio: lineHeightRatio,
    measureBlockPx: (fontSize) =>
      rowsAt(fontSize).reduce((sum, rows) => sum + rows, 0) * lineHeightAt(fontSize, geometry) +
      notes
  })
  const line = lineHeightAt(choice.fontSize, geometry)
  let usedPx = 0
  let linesVisible = 0
  for (const rows of rowsAt(choice.fontSize)) {
    usedPx += rows * line
    if (usedPx > availablePx) {
      break
    }
    linesVisible += 1
  }
  const rangeLines = target.range.endLine - target.range.startLine + 1
  return { fits: choice.fits, linesVisible, rangeLines }
}

/** What a pane's front file needs at the floor font and at the user's, for stacking. */
function paneNeed(
  shows: readonly CodeShow[],
  widthPx: number,
  geometry: PredictionGeometry,
  lengths: RangeLineLengths
): { floorPx: number; userPx: number } {
  const span = spanOf(shows)
  const at = (fontSize: number): number =>
    rowsOf(span, widthPx, fontSize, geometry, lengths).reduce((sum, rows) => sum + rows, 0) *
      lineHeightAt(fontSize, geometry) +
    notesPx(shows)
  return { floorPx: at(codeFontFloor(geometry.user.fontSize)), userPx: at(geometry.user.fontSize) }
}

/** The stage's width for a step, folding the project list when code would not fit otherwise. */
function stageWidthFor(
  geometry: PredictionGeometry,
  explorerOpen: boolean
): { widthPx: number; hasRoom: boolean } {
  const { ownerWidthPx, stageWidthPx, user } = geometry
  const extra = geometry.explorer.open && !explorerOpen ? geometry.explorer.widthPx : 0
  const at = (total: number): { widthPx: number; hasRoom: boolean } => {
    const widthPx =
      stageWidthPx > 0
        ? (stageWidthPx * total) / (ownerWidthPx + stageWidthPx)
        : total * (1 - CHAT_SHARE_BESIDE_STAGE)
    const chatFits = stageWidthPx > 0 || total * CHAT_SHARE_BESIDE_STAGE >= MIN_CHAT_WIDTH_PX
    const columns = codeColumnsAtFloor(widthPx, GUTTER_PX, user.fontSize)
    return { widthPx, hasRoom: chatFits && columns >= MIN_STAGE_COLUMNS }
  }
  const total = ownerWidthPx + stageWidthPx + extra
  const room = at(total)
  if (room.hasRoom || !geometry.projectList.open) {
    return room
  }
  const folded = at(total + geometry.projectList.widthPx)
  return folded.hasRoom ? folded : room
}

/**
 * Where a step's code would land and how it would fit, without staging it: the same placement
 * rules as `orca show code` (first range in the stage's one pane, `below` stacks while every range
 * still fits at the floor font, `right` splits a wide pane, else the least recently used pane is
 * reused) and the same font fit, on the measured stage size.
 */
function predictCode(
  shows: readonly CodeShow[],
  geometry: PredictionGeometry,
  explorerOpen: boolean,
  lengths: RangeLineLengths
): string[] {
  const stage = stageWidthFor(geometry, explorerOpen)
  if (!stage.hasRoom) {
    return shows.map(describeNarrow)
  }
  const problems: string[] = []
  const columns: number[] = [stage.widthPx]
  const panes: Pane[] = []
  let used: Pane[] = []
  const stackOf = (column: number): Pane[] => panes.filter((pane) => pane.column === column)
  const roomBelow = (column: number, show: CodeShow): boolean => {
    const widthPx = columns[column]!
    const needs = [...stackOf(column).map((pane) => pane.shows), [show]].map(
      (paneShows) => paneNeed(frontShows(paneShows), widthPx, geometry, lengths).floorPx
    )
    return (
      needs.reduce((sum, need) => sum + need, 0) + needs.length * PANE_CHROME_PX <=
      geometry.heightPx
    )
  }
  for (const show of shows) {
    if (used.length > 0 && !show.keepOthers) {
      // Why: a show without --keep replaces the step's earlier marks, and their panes close.
      problems.push(...panes.flatMap((pane) => pane.shows.map(describeOffScreen)))
      panes.length = 0
      columns.splice(0, columns.length, stage.widthPx)
      used = []
    }
    const current = used[0]
    let pane: Pane
    if (!current) {
      pane = { column: 0, shows: [] }
      panes.push(pane)
    } else if (show.place === 'beside' || show.place === 'same') {
      pane = current
    } else if (
      show.place === 'right' &&
      codeColumnsAtFloor(columns[current.column]! / 2, GUTTER_PX, geometry.user.fontSize) >=
        MIN_SPLIT_RIGHT_COLUMNS
    ) {
      columns[current.column] = columns[current.column]! / 2
      columns.push(columns[current.column]!)
      pane = { column: columns.length - 1, shows: [] }
      panes.push(pane)
    } else if (roomBelow(current.column, show)) {
      pane = { column: current.column, shows: [] }
      panes.splice(panes.indexOf(current) + 1, 0, pane)
    } else {
      pane = used.at(-1)!
      problems.push(describeReused(show, pane.shows.at(-1)!.filePath))
    }
    pane.shows.push(show)
    used = [pane, ...used.filter((candidate) => candidate !== pane)]
  }
  for (const [column, widthPx] of columns.entries()) {
    const stack = stackOf(column)
    const needs = stack.map((pane) => paneNeed(frontShows(pane.shows), widthPx, geometry, lengths))
    const shares =
      stack.length === 1
        ? [geometry.heightPx]
        : stackPaneShares(needs, geometry.heightPx, PANE_CHROME_PX)
    for (const [index, pane] of stack.entries()) {
      problems.push(...paneProblems(pane, { widthPx, heightPx: shares[index]! }, geometry, lengths))
    }
  }
  return problems
}

/** The pane's shows on the file in front: the last one opened there. */
function frontShows(shows: readonly CodeShow[]): CodeShow[] {
  const front = shows.at(-1)!.filePath
  return shows.filter((show) => show.filePath === front)
}

function paneProblems(
  pane: Pane,
  size: { widthPx: number; heightPx: number },
  geometry: PredictionGeometry,
  lengths: RangeLineLengths
): string[] {
  const front = frontShows(pane.shows)
  const hidden = pane.shows.filter((show) => !front.includes(show)).map(describeOffScreen)
  if (fitInPane(spanOf(front), notesPx(front), size, geometry, lengths).fits) {
    return hidden
  }
  const newest = front.at(-1)!
  const alone = fitInPane(newest, notesPx([newest]), size, geometry, lengths)
  const outside = front
    .slice(0, -1)
    .filter(
      (show) =>
        show.range.startLine < newest.range.startLine || show.range.endLine > newest.range.endLine
    )
    .map(describeOffScreen)
  // Why both: a cut range also reads as off screen when the step is measured.
  const cut =
    alone.linesVisible < alone.rangeLines
      ? [describeCut(newest, alone.linesVisible, alone.rangeLines), describeOffScreen(newest)]
      : []
  return [...hidden, ...cut, ...outside]
}

function unpredictedOf(step: TourStep): string[] {
  return step.requests.flatMap((request) => {
    switch (request.kind) {
      case 'code':
        return []
      case 'tree':
        return ['folder marks']
      case 'file':
        return [`${request.preview ? 'a preview of ' : ''}${request.filePath}`]
      case 'ui':
        return ['a page mark']
    }
  })
}

/**
 * Every step's predicted problems, in order. The explorer folds on the first code shown while no
 * folders are lit and the Tours panel is not on screen (as the stage makes room), and lit folders stay lit until a step lights others.
 */
export function predictTour(
  steps: readonly TourStep[],
  geometry: PredictionGeometry,
  lengths: RangeLineLengths
): StepPrediction[] {
  let explorerOpen = geometry.explorer.open
  let foldersLit = false
  return steps.map((step) => {
    foldersLit ||= stepEntryClears(step).tree
    const shows = stepRequests(step).filter(
      (request): request is CodeShow => request.kind === 'code'
    )
    if (
      shows.length > 0 &&
      stageFoldsRightSidebar({
        open: explorerOpen,
        tab: geometry.explorer.tab ?? 'explorer',
        foldersLit
      })
    ) {
      explorerOpen = false
    }
    const problems = shows.length > 0 ? predictCode(shows, geometry, explorerOpen, lengths) : []
    return { problems, unpredicted: [...new Set(unpredictedOf(step))] }
  })
}
