import { mountedCodeEditor } from './code-editor-registry'

const MAX_SETTLE_MS = 120
const STABLE_FRAMES = 3

/**
 * Resolves once the tab's editor has kept its size for a few frames (split ratios and Monaco's
 * automatic layout land over a few), or after 120 ms. A staged pane stays hidden until then.
 */
export function editorLayoutSettled(tabId: string): Promise<void> {
  return new Promise((resolve) => {
    let done = false
    const finish = (): void => {
      done = true
      clearTimeout(cap)
      resolve()
    }
    const cap = setTimeout(finish, MAX_SETTLE_MS)
    let last: string | null = null
    let stable = 0
    const tick = (): void => {
      if (done) {
        return
      }
      const layout = mountedCodeEditor(tabId)?.editor.getLayoutInfo()
      const size = layout ? `${layout.width}x${layout.height}` : ''
      stable = size === last ? stable + 1 : 0
      last = size
      if (stable >= STABLE_FRAMES) {
        finish()
      } else {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  })
}

/** Resolves once the tab's note cards have measured their real height, or after 120 ms. */
export function editorNotesMeasured(tabId: string): Promise<void> {
  return new Promise((resolve) => {
    const started = performance.now()
    const tick = (): void => {
      const mounted = mountedCodeEditor(tabId)
      if (!mounted || mounted.notesMeasured() || performance.now() - started > MAX_SETTLE_MS) {
        resolve()
      } else {
        requestAnimationFrame(tick)
      }
    }
    tick()
  })
}
