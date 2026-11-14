import type { editor } from 'monaco-editor'
import { EditorOption } from 'monaco-editor/esm/vs/editor/common/standalone/standaloneEnums.js'
import { clampCodeLineRange, type CodeLineRange } from './code-line-range'
import {
  codeFontFloor,
  codeLineHeightAt,
  fitCodeFont,
  type CodeFit,
  type CodeTypography
} from './code-fit'
import type { CodeMark } from './code-mark-store'

/** Options a marked stage editor overrides; merged after the user's so React re-renders keep them. */
export type CodeEditorFitOptions = {
  fontSize: number
  lineHeight: number
  stickyScroll: { enabled: boolean }
  occurrencesHighlight: 'off' | 'singleFile' | 'multiFile'
  selectionHighlight: boolean
  renderLineHighlight: 'none' | 'gutter' | 'line' | 'all'
}

type CodeEditorQuietOptions = Omit<CodeEditorFitOptions, 'fontSize' | 'lineHeight'>

// Why: sticky scroll ate a third of each small pane; the cursor line box and word echoes read as marks.
export const QUIET_MARKED_EDITOR: CodeEditorQuietOptions = {
  stickyScroll: { enabled: false },
  occurrencesHighlight: 'off',
  selectionHighlight: false,
  renderLineHighlight: 'none'
}

/** The editor's own values for what a marked editor quiets, to restore when its marks go. */
export function editorQuietDefaults(ed: editor.IStandaloneCodeEditor): CodeEditorQuietOptions {
  const raw = ed.getRawOptions()
  return {
    stickyScroll: { enabled: raw.stickyScroll?.enabled ?? true },
    occurrencesHighlight: raw.occurrencesHighlight ?? 'singleFile',
    selectionHighlight: raw.selectionHighlight ?? true,
    renderLineHighlight: raw.renderLineHighlight ?? 'line'
  }
}

export type CodeTabFit = CodeFit & { range: CodeLineRange }

const fitByTab = new Map<string, CodeTabFit>()

/** The fit the tab's editor settled on for its marks; none when it carries no marks. */
export function codeFitForTab(tabId: string): CodeTabFit | undefined {
  return fitByTab.get(tabId)
}

export function setCodeFitForTab(tabId: string | undefined, fit: CodeTabFit | null): void {
  if (!tabId) {
    return
  }
  if (fit) {
    fitByTab.set(tabId, fit)
  } else {
    fitByTab.delete(tabId)
  }
}

/** Monaco's derived line height per px of font, read from the live editor. */
function autoLineHeightRatio(ed: editor.IStandaloneCodeEditor): number {
  const fontSize = ed.getOption(EditorOption.fontSize)
  return fontSize > 0 ? ed.getOption(EditorOption.lineHeight) / fontSize : 1.5
}

export type CodeFitTarget = { range: CodeLineRange; marks: CodeMark[] }

/**
 * What the editor tries to fit, in order: all its marks together (a flow's hops on one file),
 * then the newest mark alone. Empty when the editor carries no marks.
 */
export function codeFitTargets(marks: readonly CodeMark[], lineCount: number): CodeFitTarget[] {
  if (marks.length === 0) {
    return []
  }
  const newest = marks.reduce((a, b) => ((b.seq ?? 0) > (a.seq ?? 0) ? b : a))
  const single = { range: clampCodeLineRange(newest, lineCount).range, marks: [newest] }
  if (marks.length === 1) {
    return [single]
  }
  const span = {
    startLine: Math.min(...marks.map((mark) => mark.startLine)),
    endLine: Math.max(...marks.map((mark) => mark.endLine))
  }
  return [{ range: clampCodeLineRange(span, lineCount).range, marks: [...marks] }, single]
}

/** Pixels from the range's first line to the end of its last, wrapped rows and cards included. */
function rangeBlockPx(
  ed: editor.IStandaloneCodeEditor,
  range: CodeLineRange,
  noteHeightPx: number
): number {
  return (
    ed.getBottomForLineNumber(range.endLine) -
    ed.getTopForLineNumber(range.startLine) +
    noteHeightPx
  )
}

/**
 * Sets the editor to the largest font (user's down to the floor) at which its target range and
 * note cards show whole, measured as Monaco lays them out, so wrapped lines count.
 */
export function fitCodeEditor(
  ed: editor.IStandaloneCodeEditor,
  target: { range: CodeLineRange },
  user: CodeTypography,
  noteHeightPx: number
): CodeFit {
  const layout = ed.getLayoutInfo()
  const ratio = autoLineHeightRatio(ed)
  // Why half a line: a range flush with both edges reads as cut off.
  const availablePx =
    layout.height - layout.horizontalScrollbarHeight - Math.round(ratio * user.fontSize * 0.5)
  const choice = fitCodeFont({
    availablePx,
    user,
    autoLineHeightRatio: ratio,
    measureBlockPx: (fontSize, lineHeight) => {
      ed.updateOptions({ fontSize, lineHeight })
      return rangeBlockPx(ed, target.range, noteHeightPx)
    }
  })
  const lineHeight = ed.getOption(EditorOption.lineHeight)
  const top = ed.getTopForLineNumber(target.range.startLine)
  let linesVisible = 0
  for (let line = target.range.startLine; line <= target.range.endLine; line += 1) {
    if (ed.getBottomForLineNumber(line) - top > availablePx) {
      break
    }
    linesVisible += 1
  }
  const rowsPx = choice.blockPx - noteHeightPx
  const scaledTo = (fontSize: number): number =>
    Math.round(
      (rowsPx * codeLineHeightAt(fontSize, user, ratio)) / Math.max(1, lineHeight) + noteHeightPx
    )
  return {
    fontSize: choice.fontSize,
    lineHeight: choice.lineHeight,
    linesVisible,
    rangeLines: target.range.endLine - target.range.startLine + 1,
    paneLines: Math.floor(layout.height / Math.max(1, lineHeight)),
    fits: choice.fits,
    needPxAtFloor: scaledTo(codeFontFloor(user.fontSize)),
    needPxAtUser: scaledTo(user.fontSize)
  }
}

/** Scrolls so the range and the note card under it sit centred, or start near the top if taller. */
export function revealCodeBlock(
  ed: editor.IStandaloneCodeEditor,
  range: CodeLineRange,
  noteHeightPx: number
): void {
  const top = ed.getTopForLineNumber(range.startLine)
  const bottom = ed.getBottomForLineNumber(range.endLine) + noteHeightPx
  const viewHeight = ed.getLayoutInfo().height
  const lineHeight = ed.getOption(EditorOption.lineHeight)
  const blockHeight = bottom - top
  const scrollTop =
    blockHeight <= viewHeight ? top - (viewHeight - blockHeight) / 2 : top - lineHeight / 2
  ed.setScrollTop(Math.max(0, scrollTop), 1)
}
