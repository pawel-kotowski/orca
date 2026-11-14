import type React from 'react'
import type { editor } from 'monaco-editor'
import { computeMonacoRevealRange } from './monaco-reveal-range'
import type { EditorRevealExtent } from '@/store/slices/editor/types/pending-editor-reveal'

export const MAX_REVEAL_CONTENT_WAIT_FRAMES = 120

/** Share mount/live reveal behavior: select and center the match or line range, then briefly highlight it. */
export function performReveal(
  ed: editor.IStandaloneCodeEditor,
  line: number,
  column: number,
  matchLength: number,
  clearTransientRevealHighlight: () => void,
  revealDecorationRef: React.RefObject<editor.IEditorDecorationsCollection | null>,
  revealHighlightTimerRef: React.RefObject<ReturnType<typeof setTimeout> | null>,
  extent: EditorRevealExtent = {}
): void {
  const focus = (): void => {
    if (extent.focus !== false) {
      ed.focus()
    }
  }
  const model = ed.getModel()
  if (!model) {
    focus()
    return
  }
  const maxLine = model.getLineCount()
  const endLine = extent.endLine === undefined ? undefined : Math.min(extent.endLine, maxLine)

  const range = computeMonacoRevealRange({
    line,
    column,
    matchLength,
    maxLine: model.getLineCount(),
    lineMaxColumn: model.getLineMaxColumn(Math.min(Math.max(1, line), maxLine)),
    endLine,
    endLineMaxColumn:
      endLine === undefined ? undefined : model.getLineMaxColumn(Math.max(1, endLine))
  })
  const shouldHighlight = matchLength > 0 || endLine !== undefined

  ed.setPosition({ lineNumber: range.startLineNumber, column: range.startColumn })
  if (shouldHighlight) {
    ed.setSelection(range)
    const rangeHeight =
      ed.getBottomForLineNumber(range.endLineNumber) - ed.getTopForLineNumber(range.startLineNumber)
    // Why: centring a range taller than the pane leaves its first line halfway down.
    if (rangeHeight > ed.getLayoutInfo().height) {
      ed.revealLineNearTop(range.startLineNumber)
    } else {
      ed.revealRangeInCenter(range)
    }
  } else {
    ed.setSelection({
      startLineNumber: range.startLineNumber,
      startColumn: range.startColumn,
      endLineNumber: range.startLineNumber,
      endColumn: range.startColumn
    })
    ed.revealPositionInCenter({ lineNumber: range.startLineNumber, column: range.startColumn })
  }

  clearTransientRevealHighlight()
  if (shouldHighlight) {
    revealDecorationRef.current = ed.createDecorationsCollection([
      {
        range,
        options: {
          inlineClassName: 'monaco-search-result-highlight',
          stickiness: 1
        }
      }
    ])
    revealHighlightTimerRef.current = setTimeout(() => {
      revealDecorationRef.current?.clear()
      revealDecorationRef.current = null
      revealHighlightTimerRef.current = null
    }, 1200)
  }

  focus()
}
