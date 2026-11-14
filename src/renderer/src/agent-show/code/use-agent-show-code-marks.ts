import { useEffect, useRef, useState } from 'react'
import type { editor } from 'monaco-editor'
import { registerCodeEditor } from './code-editor-registry'
import { createCodeMarkEditorView } from './code-mark-editor-view'
import { codeMarksOnFile, subscribeCodeMarks } from './code-mark-store'
import type { CodeFit, CodeTypography } from './code-fit'
import {
  codeFitTargets,
  editorQuietDefaults,
  fitCodeEditor,
  QUIET_MARKED_EDITOR,
  revealCodeBlock,
  setCodeFitForTab,
  type CodeEditorFitOptions,
  type CodeFitTarget
} from './code-editor-fit'
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
    // Why: a card wraps to its real height after it mounts; the fit must count that height.
    const view = createCodeMarkEditorView(ed, () => fit(true))
    const quietDefaults = editorQuietDefaults(ed)
    let applied: CodeEditorFitOptions | null = null
    let fitting = false

    const fit = (reveal: boolean): void => {
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

    const fitNow = (reveal: boolean): void => {
      const model = ed.getModel()
      const marks = codeMarksOnFile(filePath)
      view.render(marks)
      const targets = model ? codeFitTargets(marks, model.getLineCount()) : []
      if (targets.length === 0) {
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
      if (applied?.fontSize !== next.fontSize || applied.lineHeight !== next.lineHeight) {
        applied = next
        setFitOptions(next)
        reveal = true
      }
      if (reveal) {
        revealCodeBlock(ed, chosen.target.range, view.noteHeightPx(chosen.target.marks))
      }
    }
    refitRef.current = () => fit(true)
    const unregister = tabId
      ? registerCodeEditor({ editor: ed, filePath, worktreeId, tabId, refit: () => fit(true) })
      : undefined
    fit(false)
    let lineCount = ed.getModel()?.getLineCount() ?? 0
    // Why: async opens mount an empty model first; marks clamped to it must move once the text lands.
    const contentSub = ed.onDidChangeModelContent(() => {
      const next = ed.getModel()?.getLineCount() ?? 0
      if (next !== lineCount) {
        lineCount = next
        fit(false)
      }
    })
    // Why: Monaco drops a model's view zones when the editor swaps models.
    const modelSub = ed.onDidChangeModel(() => {
      view.dispose()
      fit(false)
    })
    // Why: a later split shrinks this pane; refit and recentre so the range stays whole.
    const layoutSub = ed.onDidLayoutChange(() => {
      if (applied) {
        fit(true)
      }
    })
    const unsubscribe = subscribeCodeMarks(() => fit(false))
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
