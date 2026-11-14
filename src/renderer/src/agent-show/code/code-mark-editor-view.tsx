import type { editor } from 'monaco-editor'
import { createRoot, type Root } from 'react-dom/client'
import { TranslationScopeProvider } from '@/i18n/translation-scope-provider'
import { getCommentBodyLayoutLineCount } from '@/lib/source-control/review/comments/comment-body-line-count'
import { installDiffCommentZoneMouseDownStopper } from '@/components/diff-comments/diff-comment-zone-mouse-events'
import {
  resizeDiffCommentZone,
  ZONE_CHROME_PX,
  ZONE_LINE_PX,
  ZONE_MIN_PX
} from '@/components/diff-comments/diff-comment-view-zone-entry'
import { clampCodeLineRange } from './code-line-range'
import { buildCodeMarkDecorations } from './code-mark-decorations'
import type { CodeMark } from './code-mark-store'
import { AgentShowNoteCard } from './AgentShowNoteCard'

const COMPACT_NOTE_PX = 34

type NoteZone = {
  mark: string
  zoneId: string
  domNode: HTMLElement
  delegate: editor.IViewZone
  root: Root
  disposeMouseDownStopper: () => void
}

export type CodeMarkEditorView = {
  render: (marks: readonly CodeMark[]) => void
  /** Pixel height of the note cards drawn for these marks. */
  noteHeightPx: (marks: readonly CodeMark[]) => number
  dispose: () => void
}

/**
 * One editor's marks: a decorations collection plus a note card per noted mark, below its range.
 * `onNoteResized` runs after a card's height settles, so the editor can refit around it.
 */
export function createCodeMarkEditorView(
  ed: editor.IStandaloneCodeEditor,
  onNoteResized: () => void
): CodeMarkEditorView {
  const decorations = ed.createDecorationsCollection()
  const zones = new Map<string, NoteZone>()

  const removeZones = (keys: readonly string[]): void => {
    const roots: Root[] = []
    ed.changeViewZones((accessor) => {
      for (const key of keys) {
        const zone = zones.get(key)
        if (zone) {
          accessor.removeZone(zone.zoneId)
          zone.disposeMouseDownStopper()
          roots.push(zone.root)
          zones.delete(key)
        }
      }
    })
    // Why: unmounting inside changeViewZones races Monaco's zone bookkeeping.
    queueMicrotask(() => roots.forEach((root) => root.unmount()))
  }

  const render = (marks: readonly CodeMark[]): void => {
    const model = ed.getModel()
    if (!model) {
      decorations.clear()
      removeZones([...zones.keys()])
      return
    }
    decorations.set(buildCodeMarkDecorations(marks, model))
    const lineCount = model.getLineCount()
    const wanted = new Map<string, { mark: CodeMark; compact: boolean }>()
    const newest = Math.max(...marks.map((mark) => mark.seq ?? 0))
    for (const mark of marks) {
      if (mark.note) {
        const shown = { ...mark, ...clampCodeLineRange(mark, lineCount).range }
        // Why: only the newest note is read now; older ones fold to a line so the code stays in view.
        const compact = (mark.seq ?? 0) < newest
        wanted.set(
          JSON.stringify([shown.mark, shown.startLine, shown.endLine, shown.note, compact]),
          { mark: shown, compact }
        )
      }
    }
    removeZones([...zones.keys()].filter((key) => !wanted.has(key)))
    ed.changeViewZones((accessor) => {
      for (const [key, { mark, compact }] of wanted) {
        if (zones.has(key)) {
          continue
        }
        const domNode = document.createElement('div')
        domNode.className = 'orca-diff-comment-inline'
        const delegate: editor.IViewZone = {
          afterLineNumber: mark.endLine,
          heightInPx: compact
            ? COMPACT_NOTE_PX
            : Math.max(
                ZONE_MIN_PX,
                ZONE_CHROME_PX + getCommentBodyLayoutLineCount(mark.note ?? '') * ZONE_LINE_PX
              ),
          domNode,
          suppressMouseDown: false
        }
        const zone: NoteZone = {
          mark: mark.mark,
          zoneId: accessor.addZone(delegate),
          domNode,
          delegate,
          root: createRoot(domNode),
          disposeMouseDownStopper: installDiffCommentZoneMouseDownStopper(domNode)
        }
        zones.set(key, zone)
        zone.root.render(
          <TranslationScopeProvider>
            <AgentShowNoteCard
              mark={mark}
              compact={compact}
              onResize={() => {
                const before = zone.delegate.heightInPx
                resizeDiffCommentZone(ed, zone)
                if (zone.delegate.heightInPx !== before) {
                  onNoteResized()
                }
              }}
            />
          </TranslationScopeProvider>
        )
      }
    })
  }

  return {
    render,
    noteHeightPx: (marks) => {
      const labels = new Set(marks.map((mark) => mark.mark))
      return [...zones.values()]
        .filter((zone) => labels.has(zone.mark))
        .reduce((sum, zone) => sum + (zone.delegate.heightInPx ?? 0), 0)
    },
    dispose: () => {
      decorations.clear()
      removeZones([...zones.keys()])
    }
  }
}
