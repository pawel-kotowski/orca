import { useEffect, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'
import { mountedCodeEditor, registerCodeEditor } from './code-editor-registry'
import { createCodeMarkEditorView } from './code-mark-editor-view'
import { codeMarksOnFile, marksForEditor, subscribeCodeMarks } from './code-mark-store'
import type { CodeFit, CodeTypography } from './code-fit'
import {
  codeBlockShownAt,
  codeFitTargets,
  editorQuietDefaults,
  fitCodeEditor,
  QUIET_MARKED_EDITOR,
  revealCodeBlock,
  setCodeFitForTab,
  type CodeEditorFitOptions,
  type CodeFitTarget
} from './code-editor-fit'
import { chooseCodeReveal, type CodeRevealMode } from './code-reveal-choice'
import './agent-show-code-marks.css'

/**
 * Draws `orca show code` marks on a mounted editor, lists it for `codeStateFor`, and sizes its
 * font so the marked range fits. Returns the options to merge after the user's (null: none).
 */
export function useAgentShowCodeMarks(
  ed: editor.IStandaloneCodeEditor | null,
  filePath: string,
  worktreeId: string | undefined,
  tabId: string | undefined,
  user: CodeTypography
): CodeEditorFitOptions | null {
  const [fitOptions, setFitOptions] = useState<CodeEditorFitOptions | null>(null)
  const userRef = useRef(user)
  userRef.current = user
  const refitRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!ed) {
      return
    }
    // Why: a card wraps to its real height after it mounts; the fit must count that height, but
    // recentring for a few px reads as a jump, so it scrolls only when the block would be cut.
    const view = createCodeMarkEditorView(ed, () => fit('if-cut'))
    const quietDefaults = editorQuietDefaults(ed)
    let applied: CodeEditorFitOptions | null = null
    let placed: { range: string; scrollTop: number } | null = null
    let fitting = false

    const fit = (reveal: CodeRevealMode): void => {
      // Why: measuring steps the font, which fires layout events that would re-enter here.
      if (fitting) {
        return
      }
      fitting = true
      try {
        fitNow(reveal)
      } finally {
        fitting = false
      }
    }

    const fitNow = (reveal: CodeRevealMode): void => {
      const model = ed.getModel()
      const marks = codeMarksOnFile(filePath)
      const own = marksForEditor(marks, tabId, (id) => !!mountedCodeEditor(id))
      view.render(marks, own)
      const targets = model ? codeFitTargets(own, model.getLineCount()) : []
      if (targets.length === 0) {
        placed = null
        setCodeFitForTab(tabId, null)
        if (applied) {
          applied = null
          const { fontSize, lineHeight } = userRef.current
          ed.updateOptions({ fontSize, lineHeight, ...quietDefaults })
          setFitOptions(null)
        }
        return
      }
      let chosen: { fit: CodeFit; target: CodeFitTarget } | null = null
      for (const target of targets) {
        const measured = fitCodeEditor(ed, target, userRef.current, view.noteHeightPx(target.marks))
        chosen = { fit: measured, target }
        if (measured.fits) {
          break
        }
      }
      if (!chosen) {
        return
      }
      setCodeFitForTab(tabId, { ...chosen.fit, range: chosen.target.range })
      const next = {
        fontSize: chosen.fit.fontSize,
        lineHeight: chosen.fit.lineHeight,
        ...QUIET_MARKED_EDITOR
      }
      ed.updateOptions(next)
      const fontMoved =
        applied?.fontSize !== next.fontSize || applied.lineHeight !== next.lineHeight
      if (fontMoved) {
        applied = next
        setFitOptions(next)
      }
      const { range } = chosen.target
      const rangeKey = `${range.startLine}-${range.endLine}`
      const noteHeightPx = view.noteHeightPx(chosen.target.marks)
      const choice = chooseCodeReveal({
        mode: reveal,
        // Why a new range: swapping cards shifts the scroll, so it lands in this task, not frames later.
        moved: fontMoved || rangeKey !== placed?.range,
        placedScrollTop: placed?.range === rangeKey ? placed.scrollTop : null,
        currentScrollTop: ed.getScrollTop(),
        blockShownAt: (scrollTop) => codeBlockShownAt(ed, range, noteHeightPx, scrollTop)
      })
      if (choice?.kind === 'centre') {
        revealCodeBlock(ed, range, noteHeightPx)
      } else if (choice?.kind === 'scroll') {
        ed.setScrollTop(choice.scrollTop, 1)
      }
      if (choice) {
        placed = { range: rangeKey, scrollTop: ed.getScrollTop() }
      }
    }
    refitRef.current = () => fit('centre')
    const unregister = tabId
      ? registerCodeEditor({
          editor: ed,
          filePath,
          worktreeId,
          tabId,
          refit: (mode = 'centre') => fit(mode),
          notesMeasured: view.notesMeasured
        })
      : undefined
    fit('none')
    let lineCount = ed.getModel()?.getLineCount() ?? 0
    // Why: async opens mount an empty model first; marks clamped to it must move once the text lands.
    const contentSub = ed.onDidChangeModelContent(() => {
      const next = ed.getModel()?.getLineCount() ?? 0
      if (next !== lineCount) {
        lineCount = next
        fit('none')
      }
    })
    // Why: Monaco drops a model's view zones when the editor swaps models.
    const modelSub = ed.onDidChangeModel(() => {
      view.dispose()
      fit('none')
    })
    // Why: a later split shrinks this pane; refit and recentre so the range stays whole.
    const layoutSub = ed.onDidLayoutChange(() => {
      if (applied) {
        fit('centre')
      }
    })
    const unsubscribe = subscribeCodeMarks(() => fit('none'))
    return () => {
      refitRef.current = null
      unsubscribe()
      contentSub.dispose()
      modelSub.dispose()
      layoutSub.dispose()
      view.dispose()
      setCodeFitForTab(tabId, null)
      unregister?.()
    }
  }, [ed, filePath, worktreeId, tabId])

  useEffect(() => {
    refitRef.current?.()
  }, [user.fontSize, user.lineHeight])

  return fitOptions
}
