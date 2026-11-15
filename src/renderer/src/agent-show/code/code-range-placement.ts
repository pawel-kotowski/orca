import type { CodeLineRange } from './code-line-range'
import { useAppStore } from '@/store'
import { scheduleEditorLineReveal } from '@/store/slices/editor/focus/editor-focus-reveal'
import {
  editorServedAnotherTab,
  mountedCodeEditor,
  waitForCodeEditor
} from './code-editor-registry'
import { waitForFileModel } from './code-model-file'

const EDITOR_MOUNT_WAIT_MS = 10000
const REVEAL_WAIT_MS = 3000

/** Centres the range in exactly this tab without selecting it; resolves with the file's line count. */
export function revealRangeInTab(
  filePath: string,
  fileId: string,
  tabId: string,
  range: CodeLineRange
): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), REVEAL_WAIT_MS)
    scheduleEditorLineReveal(useAppStore.getState, filePath, range.startLine, 1, fileId, {
      viewStateId: tabId,
      endLine: range.endLine,
      // Why: the user is talking to the agent; keystrokes must stay in the chat, not land in code.
      focus: false,
      // Why: a tour step lands at once; Monaco's smooth scroll plus the fit's recentre read as drift.
      instant: true,
      onApplied: () => {
        clearTimeout(timer)
        const mounted = mountedCodeEditor(tabId)
        // Why now: the reveal centred the bare range; the fit's place (range + note) must win
        // before Monaco paints, or the editor visibly jumps between the two.
        mounted?.refit('restore')
        resolve(mounted?.editor.getModel()?.getLineCount() ?? null)
      }
    })
  })
}

/**
 * Puts the range in place once the tab's editor has mounted; resolves with the file's line count.
 * An editor mounted for this tab with the file's text loaded is placed by the marks fit at once;
 * one reused from another tab gets the tab's model and view state over a few frames, so the
 * generic reveal, which lands after those, places it.
 */
export async function placeRangeWhenMounted(
  filePath: string,
  fileId: string,
  tabId: string,
  range: CodeLineRange
): Promise<number | null> {
  const mounted = await waitForCodeEditor(tabId, EDITOR_MOUNT_WAIT_MS)
  if (!mounted) {
    return null
  }
  const model = await waitForFileModel(mounted.editor, filePath, REVEAL_WAIT_MS)
  if (
    model &&
    !editorServedAnotherTab(mounted) &&
    model.getValueLength() > 0 &&
    model.getLineCount() >= range.endLine
  ) {
    mounted.refit('centre')
    return model.getLineCount()
  }
  return revealRangeInTab(filePath, fileId, tabId, range)
}
