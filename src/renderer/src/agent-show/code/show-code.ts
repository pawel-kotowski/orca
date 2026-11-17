import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowRequestOf,
  AgentShowResult,
  AgentShowVisibleEditor
} from '../../../../shared/agent-show/agent-show-contract'
import { detectLanguage } from '../../../../shared/editor-language/editor-language-detect'
import { EditorOption } from 'monaco-editor/esm/vs/editor/common/standalone/standaloneEnums.js'
import { useAppStore } from '@/store'
import { clampCodeLineRange, describeClampedRange, type CodeLineRange } from './code-line-range'
import { mountedCodeEditor, mountedCodeEditors, waitForCodeEditor } from './code-editor-registry'
import { placeRangeWhenMounted, revealRangeInTab } from './code-range-placement'
import {
  clearOwnerCodeMarks,
  codeMarkOwnerKey,
  codeMarksOnFile,
  putCodeMark
} from './code-mark-store'
import { resolveCodeTarget, sizeCodeStageStack, type CodeTarget } from './code-target-group'
import { holdStagePane, holdStageWhile } from './code-stage-hold'
import { editorLayoutSettled, editorNotesMeasured } from './code-layout-settle'
import { clearCodeStage, rememberStageTab, tidyCodeStage } from './code-stage-tabs'
import { codeFitForTab } from './code-editor-fit'
import { userCodeTypography } from './code-stage-room'
import { describeBackgroundTab, describeReusedPane } from './code-fit-report'
import { findEntityTab, isTabOnScreen, waitForAppState } from './code-view-visibility'
import { afterWindowShown, windowShown } from '../window-drawn'
import {
  contextWantsFocus,
  missingFileResult,
  outsideWorktreeResult,
  resolveShowRequestFile,
  type ShowRequestFile
} from './show-request-file'

export { showFile } from './show-file'

const TAB_WAIT_MS = 5000
const EDITOR_MOUNT_WAIT_MS = 10000

/** The reveal and fit a show in a hidden window could not do, run once the window is drawn. */
async function finishStagingWhenDrawn(
  context: AgentShowContext,
  tab: { id: string; groupId: string },
  openPath: string,
  fileId: string,
  range: CodeLineRange
): Promise<void> {
  if (!(await waitForCodeEditor(tab.id, EDITOR_MOUNT_WAIT_MS))) {
    return
  }
  await revealRangeInTab(openPath, fileId, tab.id, range)
  await editorLayoutSettled(tab.id)
  mountedCodeEditor(tab.id)?.refit('if-cut')
  sizeCodeStageStack(context, tab.groupId)
}

export const showCode: AgentShowHandler<'code'> = async (request, context) => {
  const file = resolveShowRequestFile(context, request.filePath)
  if (!file) {
    return outsideWorktreeResult(request.filePath)
  }
  const missing = await missingFileResult(context, file)
  if (missing) {
    return missing
  }
  return stageCodeFile(request, context, file)
}

/**
 * Stages a read-only copy of a file (a tour step's code as it was at the tour's commit) exactly
 * as `showCode` stages the file itself: same pane, marks and fit.
 */
export function showCodeSnapshot(
  request: AgentShowRequestOf<'code'>,
  context: AgentShowContext,
  snapshotPath: string
): Promise<AgentShowResult> {
  return stageCodeFile(request, context, {
    // Why relativePath = filePath and no owner: the copy is in this computer's temp folder, even
    // for a box's workspace, so the editor reads it here, never on the worktree's host.
    filePath: snapshotPath,
    relativePath: snapshotPath,
    worktreeId: context.worktreeId,
    language: detectLanguage(snapshotPath),
    readOnly: true,
    runtimeEnvironmentId: null
  })
}

function stageCodeFile(
  request: AgentShowRequestOf<'code'>,
  context: AgentShowContext,
  file: ShowRequestFile & { readOnly?: true; runtimeEnvironmentId?: null }
): Promise<AgentShowResult> {
  // Why a scope: a split made for this show remounts the pane it splits; both stay hidden until done.
  return holdStageWhile(async () => {
    const layoutBefore = layoutStampOf(context)
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
    const showInFront = focus && !target.background
    const drawNow = showInFront && windowShown()
    // Why before the open: the new tab's first frames (empty pane, top of file, unfitted font)
    // must not be painted; an editor already showing this file just moves, so it stays shown.
    if (
      drawNow &&
      target.groupId &&
      !showsFileNow(useAppStore.getState(), context, target.groupId, file.filePath)
    ) {
      holdStagePane(target.groupId)
    }
    return openAndStage(request, context, file, target, { showInFront, drawNow, layoutBefore })
  })
}

/** What a show can move: the worktree's panes (their tree and ratios) and either sidebar. */
function layoutStampOf(context: AgentShowContext): string {
  const { layoutByWorktree, sidebarOpen, rightSidebarOpen } = useAppStore.getState()
  // Why the tree's text: swapping a pane's tab rebuilds the layout object with nothing moved.
  return JSON.stringify([layoutByWorktree[context.worktreeId], sidebarOpen, rightSidebarOpen])
}

/** The pane's front tab is an editor already drawing this file. */
function showsFileNow(
  state: ReturnType<typeof useAppStore.getState>,
  context: AgentShowContext,
  groupId: string,
  filePath: string
): boolean {
  const front = state.groupsByWorktree[context.worktreeId]?.find((g) => g.id === groupId)
  const mounted = front?.activeTabId ? mountedCodeEditor(front.activeTabId) : undefined
  return mounted?.filePath === filePath
}

async function openAndStage(
  request: AgentShowRequestOf<'code'>,
  context: AgentShowContext,
  file: ShowRequestFile & { readOnly?: true; runtimeEnvironmentId?: null },
  target: CodeTarget,
  {
    showInFront,
    drawNow,
    layoutBefore
  }: {
    showInFront: boolean
    drawNow: boolean
    layoutBefore: string
  }
): Promise<AgentShowResult> {
  const before = useAppStore.getState()
  const alreadyOpenTabIds = new Set(
    (before.unifiedTabsByWorktree[context.worktreeId] ?? [])
      .filter((tab) => tab.groupId === target.groupId)
      .map((tab) => tab.id)
  )
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
    { ...request.range, mark: request.mark, note: request.note, tabId: tab.id },
    request.keepOthers
  )
  tidyCodeStage(context, tab.id)
  // Why mounted first: the editor holds one pending reveal, so a later show would replace ours.
  // Why: a hidden window draws nothing, so the editor cannot mount and the range cannot be revealed
  // or measured now; finish that when the user brings Orca forward, and say so instead of waiting.
  if (showInFront && !drawNow) {
    afterWindowShown(
      tab.id,
      () => void finishStagingWhenDrawn(context, tab, openPath, fileId, request.range)
    )
  }
  const lineCount = drawNow
    ? await placeRangeWhenMounted(openPath, fileId, tab.id, request.range)
    : (mountedCodeEditor(tab.id)?.editor.getModel()?.getLineCount() ?? null)
  if (drawNow) {
    // Why: a card first draws at an estimated height; its real one shifts the scroll by a few px.
    await editorNotesMeasured(tab.id)
  }
  // Why after the fit: a pane's share of the stack follows what its range measured as needing.
  const stackResized = drawNow && sizeCodeStageStack(context, tab.groupId)
  // Why only then: a fold, split or new ratio lands over a few frames and refits the editor; with
  // none, it is already in place and the step can show.
  if (stackResized || (drawNow && layoutStampOf(context) !== layoutBefore)) {
    await editorLayoutSettled(tab.id)
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
    target.reusedForRoom
      ? describeReusedPane(target.replacedLabel, target.linesPerPaneIfSplit)
      : null,
    lineCount === null && !target.background && windowShown()
      ? 'the editor has not drawn the file yet'
      : null,
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
