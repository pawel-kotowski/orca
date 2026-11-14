import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowVisibleEditor
} from '../../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store'
import { scheduleEditorLineReveal } from '@/store/slices/editor/focus/editor-focus-reveal'
import { clampCodeLineRange, describeClampedRange, type CodeLineRange } from './code-line-range'
import { mountedCodeEditor, mountedCodeEditors, waitForCodeEditor } from './code-editor-registry'
import {
  clearOwnerCodeMarks,
  codeMarkOwnerKey,
  codeMarksOnFile,
  putCodeMark
} from './code-mark-store'
import { rememberOwnerGroup, resolveCodeTargetGroup } from './code-target-group'
import { findEntityTab, isTabOnScreen, waitForAppState } from './code-view-visibility'
import {
  contextWantsFocus,
  outsideWorktreeResult,
  resolveShowRequestFile
} from './show-request-file'

export { showFile } from './show-file'

const TAB_WAIT_MS = 5000
const EDITOR_MOUNT_WAIT_MS = 10000
const REVEAL_WAIT_MS = 3000

/** Selects and centres the range in exactly this tab; resolves with the file's line count once shown. */
function revealRangeInTab(
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
      onApplied: () => {
        clearTimeout(timer)
        resolve(mountedCodeEditor(tabId)?.editor.getModel()?.getLineCount() ?? null)
      }
    })
  })
}

export const showCode: AgentShowHandler<'code'> = async (request, context) => {
  const file = resolveShowRequestFile(context, request.filePath)
  if (!file) {
    return outsideWorktreeResult(request.filePath)
  }
  const focus = contextWantsFocus(context)
  const targetGroupId = resolveCodeTargetGroup(context, request.place, focus)
  const fileId = useAppStore
    .getState()
    .openFile({ ...file, mode: 'edit' }, { targetGroupId, selection: focus ? 'focus' : 'none' })
  const tab = await waitForAppState(
    (state) => findEntityTab(state, context.worktreeId, fileId, targetGroupId),
    TAB_WAIT_MS
  )
  if (!tab) {
    return { ok: false, code: 'open_failed', message: `${file.relativePath} did not open` }
  }
  rememberOwnerGroup(context, tab.groupId)
  const openPath =
    useAppStore.getState().openFiles.find((open) => open.id === fileId)?.filePath ?? file.filePath
  if (focus && file.language === 'markdown') {
    // Why: rendered Markdown has no line view; ranges need the source editor.
    useAppStore.getState().setMarkdownViewMode(fileId, 'source')
  }
  const placed = putCodeMark(
    codeMarkOwnerKey(context),
    openPath,
    { ...request.range, mark: request.mark, note: request.note },
    request.keepOthers
  )
  // Why mounted first: the editor holds one pending reveal, so a later show would replace ours.
  const lineCount = focus
    ? (await waitForCodeEditor(tab.id, EDITOR_MOUNT_WAIT_MS)) &&
      (await revealRangeInTab(openPath, fileId, tab.id, request.range))
    : (mountedCodeEditor(tab.id)?.editor.getModel()?.getLineCount() ?? null)
  const clamp = lineCount === null ? null : clampCodeLineRange(request.range, lineCount)
  const details = [
    `mark ${placed.mark} in ${file.relativePath}`,
    lineCount === null ? 'the editor has not drawn the file yet' : null,
    clamp?.clamped ? describeClampedRange(request.range, clamp.range, lineCount ?? 0) : null
  ]
  return {
    ok: true,
    visible: isTabOnScreen(useAppStore.getState(), context.worktreeId, tab.id),
    detail: details.filter(Boolean).join('; ')
  }
}

export function clearCodeMarks(context: AgentShowContext): void {
  clearOwnerCodeMarks(codeMarkOwnerKey(context))
}

/** Every editor on screen in the context's worktree: its file, visible lines and the marks on it. */
export function codeStateFor(context: AgentShowContext): AgentShowVisibleEditor[] {
  const state = useAppStore.getState()
  const tabs = state.unifiedTabsByWorktree[context.worktreeId] ?? []
  return mountedCodeEditors().flatMap((mounted) => {
    const tab = tabs.find((candidate) => candidate.id === mounted.tabId)
    if (!tab || !isTabOnScreen(state, context.worktreeId, tab.id)) {
      return []
    }
    const ranges = mounted.editor.getVisibleRanges()
    const first = ranges[0]
    const last = ranges.at(-1)
    return [
      {
        groupId: tab.groupId,
        tabId: tab.id,
        filePath: mounted.filePath,
        visibleRange:
          first && last ? { startLine: first.startLineNumber, endLine: last.endLineNumber } : null,
        marks: codeMarksOnFile(mounted.filePath).map((mark) => mark.mark)
      }
    ]
  })
}
