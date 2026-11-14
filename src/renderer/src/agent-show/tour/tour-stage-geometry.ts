import { EditorOption } from 'monaco-editor/esm/vs/editor/common/standalone/standaloneEnums.js'
import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import { resolveFileEditorWordWrap } from '../../../../shared/editor/editor-typography'
import { useAppStore } from '@/store/index'
import { findCodeStage } from '../code/code-stage'
import { AUTO_LINE_HEIGHT_RATIO, userCodeTypography } from '../code/code-stage-room'
import { mountedCodeEditors } from '../code/code-editor-registry'
import { worktreeDrawn } from '../window-drawn'
import type { PredictionGeometry } from './tour-fit-prediction'

type Box = { left: number; top: number; right: number; bottom: number }

/** A pane's body and tab strip together, as drawn. */
function paneBox(groupId: string): Box | null {
  const id = CSS.escape(groupId)
  const boxes = [
    document.querySelector(`[data-tab-group-body-id="${id}"]`),
    document.querySelector(`[data-tab-group-strip-id="${id}"]`)
  ].flatMap((element) => {
    const rect = element?.getBoundingClientRect()
    return rect && rect.width > 0 ? [rect] : []
  })
  if (boxes.length === 0) {
    return null
  }
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom))
  }
}

function union(boxes: readonly Box[]): Box {
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom))
  }
}

/**
 * The chat's pane, the stage beside it and the sidebars as drawn now (the strip floats over them and
 * takes no room); null when the owner's workspace is not on screen, since nothing can be measured then.
 */
export function measurePredictionGeometry(context: AgentShowContext): PredictionGeometry | null {
  const state = useAppStore.getState()
  const { worktreeId, ownerTabId } = context
  if (!ownerTabId || !worktreeDrawn(state, worktreeId)) {
    return null
  }
  const owner = state.unifiedTabsByWorktree[worktreeId]?.find(
    (tab) => tab.id === ownerTabId || tab.entityId === ownerTabId
  )
  const ownerBox = owner ? paneBox(owner.groupId) : null
  if (!owner || !ownerBox) {
    return null
  }
  const layout = state.layoutByWorktree[worktreeId]
  const stage = layout ? findCodeStage(layout, owner.groupId) : null
  const stageBoxes = (stage?.leaves ?? []).flatMap((id) => paneBox(id) ?? [])
  const stageBox = stageBoxes.length > 0 ? union(stageBoxes) : null
  const column = stageBox ?? ownerBox
  const editor = mountedCodeEditors()[0]?.editor
  const editorFont = editor?.getOption(EditorOption.fontSize) ?? 0
  return {
    ownerWidthPx: ownerBox.right - ownerBox.left,
    stageWidthPx: stageBox ? stageBox.right - stageBox.left : 0,
    heightPx: column.bottom - column.top,
    explorer: { open: state.rightSidebarOpen, widthPx: state.rightSidebarWidth },
    projectList: { open: state.sidebarOpen, widthPx: state.sidebarWidth },
    user: userCodeTypography(state),
    lineHeightRatio:
      editor && editorFont > 0
        ? editor.getOption(EditorOption.lineHeight) / editorFont
        : AUTO_LINE_HEIGHT_RATIO,
    wordWrap: resolveFileEditorWordWrap(state.settings?.editorWordWrap) === 'on'
  }
}
