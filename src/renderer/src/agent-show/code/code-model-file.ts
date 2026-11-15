import type { editor } from 'monaco-editor'

/** The model's URI path names this file (a Windows path's URI gains a leading slash). */
export function modelShowsFile(modelUriPath: string, filePath: string): boolean {
  const file = filePath.replace(/\\/g, '/')
  return modelUriPath === file || modelUriPath === `/${file}`
}

/**
 * The editor's model once it is this file's, or null after `timeoutMs`: a pane switching tabs keeps
 * its editor, which holds the old file's model until the new text has loaded.
 */
export function waitForFileModel(
  ed: editor.IStandaloneCodeEditor,
  filePath: string,
  timeoutMs: number
): Promise<editor.ITextModel | null> {
  const current = ed.getModel()
  if (current && modelShowsFile(current.uri.path, filePath)) {
    return Promise.resolve(current)
  }
  return new Promise((resolve) => {
    const finish = (model: editor.ITextModel | null): void => {
      clearTimeout(timer)
      sub.dispose()
      resolve(model)
    }
    const sub = ed.onDidChangeModel(() => {
      const model = ed.getModel()
      if (model && modelShowsFile(model.uri.path, filePath)) {
        finish(model)
      }
    })
    const timer = setTimeout(() => finish(null), timeoutMs)
  })
}
