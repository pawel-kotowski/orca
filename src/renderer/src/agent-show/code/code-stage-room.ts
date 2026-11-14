import type { TabGroupLayoutNode } from '../../../../shared/tab-types'
import { resolveEditorTypography } from '../../../../shared/editor/editor-typography'
import type { AppState } from '@/store/types'
import {
  ZONE_CHROME_PX,
  ZONE_LINE_PX
} from '@/components/diff-comments/diff-comment-view-zone-entry'
import {
  codeColumnsAtFloor,
  codeLineHeightAt,
  codePaneNeedPx,
  type CodeTypography
} from './code-fit'
import { codeFitForTab } from './code-editor-fit'
import { verticalStackAround, type CodeStage } from './code-stage'

/** Columns of code a stage pane must show at the floor font, else code goes to a background tab. */
export const MIN_STAGE_COLUMNS = 60
/** A second stage column only when each half still shows this many. */
const MIN_SPLIT_RIGHT_COLUMNS = 72
const MIN_CHAT_WIDTH_PX = 320
// Why 0.42: code wraps in a narrow pane; the chat's few sentences read fine in less width.
export const CHAT_SHARE_BESIDE_STAGE = 0.42
const GUTTER_PX = 56
const STRIP_PX = 36
/** Height kept for a pane in the stack that shows no marks of ours (the user's own tab). */
const UNMARKED_PANE_PX = 160
/** A browser page the agent points at keeps enough height to read. */
const PAGE_PANE_PX = 360
// Why 1.5: Monaco's derived line height on macOS; elsewhere it is smaller, so this errs safe.
const AUTO_LINE_HEIGHT_RATIO = 1.5

type Rect = { width: number; height: number }

function groupBodyRect(groupId: string): Rect | null {
  const body = document.querySelector(`[data-tab-group-body-id="${CSS.escape(groupId)}"]`)
  const rect = body?.getBoundingClientRect()
  return rect && rect.width > 0 ? { width: rect.width, height: rect.height } : null
}

function groupStripPx(groupId: string): number {
  const strip = document.querySelector(`[data-tab-group-strip-id="${CSS.escape(groupId)}"]`)
  return strip?.getBoundingClientRect().height || STRIP_PX
}

export function userCodeTypography(state: AppState): CodeTypography {
  const typography = resolveEditorTypography(state.settings, state.editorFontZoomLevel)
  return { fontSize: typography.fontSize, lineHeight: typography.lineHeight }
}

function noteCardPx(note: string | undefined): number {
  // Why: the card wraps at about 60 characters in a stage pane.
  return note ? ZONE_CHROME_PX + Math.ceil(note.length / 60) * ZONE_LINE_PX : 0
}

export type StageRoom = { stageHasRoom: boolean; roomBelow: boolean; roomRight: boolean }

/** Whether the window has room for the stage, a pane below the current one, or one to its right. */
export function measureStageRoom(input: {
  state: AppState
  layout: TabGroupLayoutNode | undefined
  ownerGroupId: string
  stage: CodeStage | null
  currentPane: string | null
  newRange: { lines: number; note?: string }
  /** The editor need of a pane already in the stack; null when it will be emptied. */
  paneNeedPx: (groupId: string) => number | null
  /** Width a folded sidebar would give the panes. */
  extraWidthPx?: number
}): StageRoom {
  const extra = input.extraWidthPx ?? 0
  const { state, layout, ownerGroupId, stage, currentPane } = input
  const user = userCodeTypography(state)
  if (!stage || !currentPane || !layout) {
    const owner = groupBodyRect(ownerGroupId)
    const width = owner ? owner.width + extra : 0
    const stageHasRoom =
      width * CHAT_SHARE_BESIDE_STAGE >= MIN_CHAT_WIDTH_PX &&
      codeColumnsAtFloor(width * (1 - CHAT_SHARE_BESIDE_STAGE), GUTTER_PX, user.fontSize) >=
        MIN_STAGE_COLUMNS
    return { stageHasRoom, roomBelow: false, roomRight: false }
  }
  const measured = groupBodyRect(currentPane)
  const current = measured && { ...measured, width: measured.width + extra / 2 }
  const stageHasRoom =
    !current || codeColumnsAtFloor(current.width, GUTTER_PX, user.fontSize) >= MIN_STAGE_COLUMNS
  const roomRight =
    !!current &&
    codeColumnsAtFloor(current.width / 2, GUTTER_PX, user.fontSize) >= MIN_SPLIT_RIGHT_COLUMNS
  const stack = verticalStackAround(layout, stage.path, currentPane)
  if (!stack) {
    return { stageHasRoom, roomBelow: false, roomRight }
  }
  let heightPx = 0
  let needPx = codePaneNeedPx(
    input.newRange.lines,
    noteCardPx(input.newRange.note),
    user,
    AUTO_LINE_HEIGHT_RATIO
  )
  let panes = 1
  for (const groupId of stack.leaves) {
    const rect = groupBodyRect(groupId)
    const strip = groupStripPx(groupId)
    heightPx += (rect?.height ?? 0) + strip
    const need = input.paneNeedPx(groupId)
    if (need !== null) {
      needPx += need
      panes += 1
    }
  }
  return { stageHasRoom, roomBelow: needPx + panes * STRIP_PX <= heightPx, roomRight }
}

/** A marked pane needs its fitted range at the floor font; an unmarked one keeps a little room. */
export function markedPaneNeedPx(activeTabId: string | null, showsPage = false): number {
  if (showsPage) {
    return PAGE_PANE_PX
  }
  const fit = activeTabId ? codeFitForTab(activeTabId) : undefined
  if (!fit) {
    return UNMARKED_PANE_PX
  }
  return fit.needPxAtFloor
}

/** The height share a pane about to open asks for. */
export function newPaneNeedForRatio(state: AppState, lines: number, note?: string): number {
  const user = userCodeTypography(state)
  const lineHeight = codeLineHeightAt(user.fontSize, user, AUTO_LINE_HEIGHT_RATIO)
  return lines * lineHeight + noteCardPx(note) + STRIP_PX
}

/** Each stack pane's share of height: what its range needs at the user's font, so all can keep it when there is room. */
export function stagePaneNeedForRatio(activeTabId: string | null, showsPage = false): number {
  if (showsPage) {
    return PAGE_PANE_PX + STRIP_PX
  }
  const fit = activeTabId ? codeFitForTab(activeTabId) : undefined
  return (fit ? fit.needPxAtUser : UNMARKED_PANE_PX) + STRIP_PX
}
