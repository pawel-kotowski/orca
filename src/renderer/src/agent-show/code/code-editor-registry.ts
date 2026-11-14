import type { editor } from 'monaco-editor'

export type MountedCodeEditor = {
  editor: editor.IStandaloneCodeEditor
  filePath: string
  worktreeId: string | undefined
  /** The unified tab the editor draws (Monaco's viewStateId). */
  tabId: string
  /** Re-fits the font to the editor's marks and centres them. */
  refit: () => void
}

const editorsByTab = new Map<string, MountedCodeEditor>()
const mountListeners = new Set<(entry: MountedCodeEditor) => void>()

export function registerCodeEditor(entry: MountedCodeEditor): () => void {
  editorsByTab.set(entry.tabId, entry)
  for (const listener of mountListeners) {
    listener(entry)
  }
  return () => {
    // Why: a remount registers the new editor before the old one's cleanup runs.
    if (editorsByTab.get(entry.tabId) === entry) {
      editorsByTab.delete(entry.tabId)
    }
  }
}

export function mountedCodeEditor(tabId: string): MountedCodeEditor | undefined {
  return editorsByTab.get(tabId)
}

export function mountedCodeEditors(): MountedCodeEditor[] {
  return [...editorsByTab.values()]
}

/** The tab's editor once mounted (first open loads Monaco), or null after `timeoutMs`. */
export function waitForCodeEditor(
  tabId: string,
  timeoutMs: number
): Promise<MountedCodeEditor | null> {
  const mounted = editorsByTab.get(tabId)
  if (mounted) {
    return Promise.resolve(mounted)
  }
  return new Promise((resolve) => {
    const finish = (entry: MountedCodeEditor | null): void => {
      clearTimeout(timer)
      mountListeners.delete(listener)
      resolve(entry)
    }
    const listener = (entry: MountedCodeEditor): void => {
      if (entry.tabId === tabId) {
        finish(entry)
      }
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    mountListeners.add(listener)
  })
}
