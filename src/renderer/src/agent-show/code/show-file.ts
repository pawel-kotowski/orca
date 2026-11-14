import type { AgentShowHandler } from '../../../../shared/agent-show/agent-show-contract'
import type { AppState } from '@/store/types'
import { useAppStore } from '@/store'
import { openHtmlFilePreview } from '@/lib/browser/documents/open-html-file-preview'
import { resolveEditorOpenTargetGroupId } from '@/store/slices/editor/tabs/editor-open-target-group'
import {
  getEditorViewLanguage,
  getMarkdownViewModes
} from '@/components/editor/view-mode/markdown-preview-controls'
import { resolveCodeTarget } from './code-target-group'
import { rememberStageTab } from './code-stage-tabs'
import { describeBackgroundTab } from './code-fit-report'
import { findEntityTab, isTabOnScreen, waitForAppState } from './code-view-visibility'
import {
  contextWantsFocus,
  missingFileResult,
  outsideWorktreeResult,
  resolveShowRequestFile,
  type ShowRequestFile
} from './show-request-file'

const TAB_WAIT_MS = 5000

/** Opens the file the way its kind wants; returns how to find the tab that shows it. */
function openShownFile(
  file: ShowRequestFile,
  preview: boolean,
  targetGroupId: string | undefined,
  focus: boolean
): (state: AppState) => { id: string; groupId: string } | null {
  const store = useAppStore.getState()
  const { worktreeId } = file
  if (preview && file.language === 'html') {
    const groupId = targetGroupId ?? resolveEditorOpenTargetGroupId(store, worktreeId)
    if (groupId) {
      const before = store.groupsByWorktree[worktreeId]?.find((g) => g.id === groupId)?.activeTabId
      openHtmlFilePreview({ filePath: file.filePath, worktreeId, targetGroupId: groupId })
      return (state) => {
        const group = state.groupsByWorktree[worktreeId]?.find((g) => g.id === groupId)
        const tab = state.unifiedTabsByWorktree[worktreeId]?.find(
          (candidate) => candidate.id === group?.activeTabId
        )
        return tab && tab.id !== before && tab.contentType === 'browser' ? tab : null
      }
    }
  }
  const fileId = store.openFile(
    { ...file, mode: 'edit' },
    { targetGroupId, selection: focus ? 'focus' : 'none' }
  )
  // Markdown, Mermaid, SVG and CSV render in their own tab's rich view; images need nothing.
  const viewLanguage = getEditorViewLanguage(file.filePath, file.language)
  if (preview && getMarkdownViewModes({ language: viewLanguage, mode: 'edit' }).includes('rich')) {
    store.setMarkdownViewMode(fileId, 'rich')
  }
  return (state) => findEntityTab(state, worktreeId, fileId, targetGroupId)
}

export const showFile: AgentShowHandler<'file'> = async (request, context) => {
  const file = resolveShowRequestFile(context, request.filePath)
  if (!file) {
    return outsideWorktreeResult(request.filePath)
  }
  const missing = await missingFileResult(context, file)
  if (missing) {
    return missing
  }
  const focus = contextWantsFocus(context)
  // Why 40 lines: a file view has no range; ask the stage for a pane about that tall.
  const target = resolveCodeTarget(
    context,
    { place: request.place, lines: 40, keepOthers: true },
    focus
  )
  const targetGroupId = target.groupId
  const before = new Set(
    (useAppStore.getState().unifiedTabsByWorktree[file.worktreeId] ?? []).map((t) => t.id)
  )
  let findTab: ReturnType<typeof openShownFile>
  try {
    findTab = openShownFile(file, request.preview, targetGroupId, focus && !target.background)
  } catch (error) {
    return {
      ok: false,
      code: 'open_failed',
      message: error instanceof Error ? error.message : String(error)
    }
  }
  const tab = await waitForAppState(findTab, TAB_WAIT_MS)
  if (!tab) {
    return { ok: false, code: 'open_failed', message: `${file.relativePath} did not open` }
  }
  rememberStageTab(context, {
    tabId: tab.id,
    groupId: tab.groupId,
    filePath: file.filePath,
    openedByShow: targetGroupId !== undefined && !before.has(tab.id)
  })
  if (target.background) {
    return { ok: true, visible: false, detail: describeBackgroundTab(file.relativePath) }
  }
  return { ok: true, visible: isTabOnScreen(useAppStore.getState(), context.worktreeId, tab.id) }
}
