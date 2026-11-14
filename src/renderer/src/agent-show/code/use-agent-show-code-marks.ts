import { useEffect } from 'react'
import type { editor } from 'monaco-editor'
import { registerCodeEditor } from './code-editor-registry'
import { createCodeMarkEditorView } from './code-mark-editor-view'
import { codeMarksOnFile, subscribeCodeMarks } from './code-mark-store'
import './agent-show-code-marks.css'

/** Draws `orca show code` marks on a mounted editor and lists it for `codeStateFor`. */
export function useAgentShowCodeMarks(
  ed: editor.IStandaloneCodeEditor | null,
  filePath: string,
  worktreeId: string | undefined,
  tabId: string | undefined
): void {
  useEffect(() => {
    if (!ed) {
      return
    }
    const unregister = tabId
      ? registerCodeEditor({ editor: ed, filePath, worktreeId, tabId })
      : undefined
    const view = createCodeMarkEditorView(ed)
    const render = (): void => view.render(codeMarksOnFile(filePath))
    render()
    let lineCount = ed.getModel()?.getLineCount() ?? 0
    // Why: async opens mount an empty model first; marks clamped to it must move once the text lands.
    const contentSub = ed.onDidChangeModelContent(() => {
      const next = ed.getModel()?.getLineCount() ?? 0
      if (next !== lineCount) {
        lineCount = next
        render()
      }
    })
    // Why: Monaco drops a model's view zones when the editor swaps models.
    const modelSub = ed.onDidChangeModel(() => {
      view.dispose()
      render()
    })
    const unsubscribe = subscribeCodeMarks(render)
    return () => {
      unsubscribe()
      contentSub.dispose()
      modelSub.dispose()
      view.dispose()
      unregister?.()
    }
  }, [ed, filePath, worktreeId, tabId])
}
