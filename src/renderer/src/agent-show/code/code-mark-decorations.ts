import type { editor } from 'monaco-editor'
import { clampCodeLineRange } from './code-line-range'
import type { CodeMark } from './code-mark-store'

/** Whole-line tint + left bar over the range, and the mark as a badge before its first line's code. */
export function buildCodeMarkDecorations(
  marks: readonly CodeMark[],
  model: Pick<editor.ITextModel, 'getLineCount' | 'getLineFirstNonWhitespaceColumn'>
): editor.IModelDeltaDecoration[] {
  const lineCount = model.getLineCount()
  return marks.flatMap((mark) => {
    const { startLine, endLine } = clampCodeLineRange(mark, lineCount).range
    const badgeColumn = model.getLineFirstNonWhitespaceColumn(startLine) || 1
    return [
      {
        range: { startLineNumber: startLine, startColumn: 1, endLineNumber: endLine, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: 'orca-agent-show-line',
          linesDecorationsClassName: 'orca-agent-show-line-bar',
          ...(mark.note ? { hoverMessage: { value: mark.note } } : {}),
          stickiness: 1
        }
      },
      {
        range: {
          startLineNumber: startLine,
          startColumn: badgeColumn,
          endLineNumber: startLine,
          endColumn: badgeColumn
        },
        options: {
          before: { content: mark.mark, inlineClassName: 'orca-agent-show-mark-badge' },
          showIfCollapsed: true,
          stickiness: 1
        }
      }
    ]
  })
}
