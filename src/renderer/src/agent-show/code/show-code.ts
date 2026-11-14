import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowVisibleEditor
} from '../../../../shared/agent-show/agent-show-contract'
import { EditorOption } from 'monaco-editor/esm/vs/editor/common/standalone/standaloneEnums.js'
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
import { resolveCodeTarget, sizeCodeStageStack } from './code-target-group'
import { clearCodeStage, rememberStageTab, tidyCodeStage } from './code-stage-tabs'
import { codeFitForTab } from './code-editor-fit'
import { userCodeTypography } from './code-stage-room'
import { describeBackgroundTab, describeReusedPane } from './code-fit-report'
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
const LAYOUT_SETTLE_MS = 120

/** Centres the range in exactly this tab without selecting it; resolves with the file's line count. */
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

// Why a timer, not frames: split ratios and Monaco's automatic layout land over a few frames.
const layoutSettled = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, LAYOUT_SETTLE_MS))

export const showCode: AgentShowHandler<'code'> = async (request, context) => {
  const file = resolveShowRequestFile(context, request.filePath)
  if (!file) {
    return outsideWorktreeResult(request.filePath)
  }
  const focus = contextWantsFocus(context)
  const target = resolveCodeTarget(
    context,
    {
      place: request.place,
      lines: request.range.endLine - request.range.startLine + 1,
      note: request.note,
      keepOthers: request.keepOthers
    },
    focus
  )
  const before = useAppStore.getState()
  const alreadyOpenTabIds = new Set(
    (before.unifiedTabsByWorktree[context.worktreeId] ?? [])
      .filter((tab) => tab.groupId === target.groupId)
      .map((tab) => tab.id)
  )
  const showInFront = focus && !target.background
  const fileId = before.openFile(
    { ...file, mode: 'edit' },
    { targetGroupId: target.groupId, selection: showInFront ? 'focus' : 'none' }
  )
  const tab = await waitForAppState(
    (state) => findEntityTab(state, context.worktreeId, fileId, target.groupId),
    TAB_WAIT_MS
  )
  if (!tab) {
    return { ok: false, code: 'open_failed', message: `${file.relativePath} did not open` }
  }
  const openPath =
    useAppStore.getState().openFiles.find((open) => open.id === fileId)?.filePath ?? file.filePath
  rememberStageTab(context, {
    tabId: tab.id,
    groupId: tab.groupId,
    filePath: openPath,
    // Why: with no owner tab placement is the editor's own, as before stages; nothing is tidied.
    openedByShow: target.groupId !== undefined && !alreadyOpenTabIds.has(tab.id)
  })
  if (showInFront && file.language === 'markdown') {
    // Why: rendered Markdown has no line view; ranges need the source editor.
    useAppStore.getState().setMarkdownViewMode(fileId, 'source')
  }
  const placed = putCodeMark(
    codeMarkOwnerKey(context),
    openPath,
    { ...request.range, mark: request.mark, note: request.note },
    request.keepOthers
  )
  tidyCodeStage(context, tab.id)
  // Why mounted first: the editor holds one pending reveal, so a later show would replace ours.
  const lineCount = showInFront
    ? (await waitForCodeEditor(tab.id, EDITOR_MOUNT_WAIT_MS)) &&
      (await revealRangeInTab(openPath, fileId, tab.id, request.range))
    : (mountedCodeEditor(tab.id)?.editor.getModel()?.getLineCount() ?? null)
  if (showInFront) {
    await layoutSettled()
    mountedCodeEditor(tab.id)?.refit()
    // Why after the fit: a pane's share of the stack follows what its range measured as needing.
    sizeCodeStageStack(context, tab.groupId)
    await layoutSettled()
  }
  const clamp = lineCount === null ? null : clampCodeLineRange(request.range, lineCount)
  const fit = codeFitForTab(tab.id)
  const userFontSize = userCodeTypography(useAppStore.getState()).fontSize
  const tabLabel = useAppStore
    .getState()
    .unifiedTabsByWorktree[context.worktreeId]?.find((candidate) => candidate.id === tab.id)?.label
  const details = [
    `mark ${placed.mark} in ${file.relativePath}`,
    target.background ? describeBackgroundTab(tabLabel ?? file.relativePath) : null,
    target.reusedForRoom ? describeReusedPane() : null,
    lineCount === null && !target.background ? 'the editor has not drawn the file yet' : null,
    clamp?.clamped ? describeClampedRange(request.range, clamp.range, lineCount ?? 0) : null
  ]
  return {
    ok: true,
    visible:
      !target.background && isTabOnScreen(useAppStore.getState(), context.worktreeId, tab.id),
    detail: details.filter(Boolean).join('; '),
    ...(fit
      ? {
          fit: {
            linesVisible: fit.linesVisible,
            rangeLines: fit.rangeLines,
            fontSize: fit.fontSize,
            userFontSize
          }
        }
      : {})
  }
}

export function clearCodeMarks(context: AgentShowContext): void {
  clearOwnerCodeMarks(codeMarkOwnerKey(context))
  clearCodeStage(context)
}

/** Every editor on screen in the context's worktree: its file, visible lines, font and marks. */
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
    const visibleRange =
      first && last ? { startLine: first.startLineNumber, endLine: last.endLineNumber } : null
    const fit = codeFitForTab(tab.id)
    const lineHeight = mounted.editor.getOption(EditorOption.lineHeight)
    return [
      {
        groupId: tab.groupId,
        tabId: tab.id,
        filePath: mounted.filePath,
        visibleRange,
        marks: codeMarksOnFile(mounted.filePath).map((mark) => mark.mark),
        fontSize: mounted.editor.getOption(EditorOption.fontSize),
        paneLines:
          lineHeight > 0 ? Math.floor(mounted.editor.getLayoutInfo().height / lineHeight) : 0,
        fits:
          !fit ||
          (!!visibleRange &&
            visibleRange.startLine <= fit.range.startLine &&
            visibleRange.endLine >= fit.range.endLine)
      }
    ]
  })
}
