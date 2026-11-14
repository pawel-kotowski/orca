import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowState
} from '../../../../shared/agent-show/agent-show-contract'
import { relativePathInsideRoot } from '../../../../shared/cross-platform-path'
import { activateBrowserWorkspaceTab } from '@/lib/browser/workspace/browser-workspace-tab-activation'
import { useAppStore } from '@/store/index'
import { isUiPageOnScreen, resolveUiPageTarget } from './ui-page-target'
import {
  nextUiMarkLabel,
  putUiPageMark,
  takeOwnerUiMarks,
  uiPageMarkKey,
  uiPagesWithMarks
} from './ui-page-marks'
import { listenForUiPageEvents } from './ui-page-events'

function codeLabelFor(
  code: { filePath: string; range: { startLine: number; endLine: number } },
  worktreePath: string
): string {
  const path = relativePathInsideRoot(worktreePath, code.filePath) || code.filePath
  const { startLine, endLine } = code.range
  return `${path}:${startLine === endLine ? startLine : `${startLine}-${endLine}`}`
}

// Numbered outlines over browser page elements, optionally linked to code.
export const showUi: AgentShowHandler<'ui'> = async (request, context) => {
  const api = window.api.browser
  if (!api.agentShowMarkPage) {
    return { ok: false, code: 'unsupported', message: 'This Orca window cannot mark browser pages' }
  }
  const focus = (context as { focus?: boolean }).focus !== false
  const target = resolveUiPageTarget(useAppStore.getState(), context.worktreeId, request.pageId)
  if (!target.ok) {
    return target
  }
  if (focus) {
    activateBrowserWorkspaceTab({
      worktreeId: context.worktreeId,
      workspaceId: target.workspaceId,
      pageId: target.pageId
    })
  }
  const label = request.mark ?? nextUiMarkLabel(target.pageId, context.ownerTabId)
  const key = uiPageMarkKey(context.ownerTabId, label)
  listenForUiPageEvents()
  const result = await api.agentShowMarkPage({
    browserPageId: target.pageId,
    worktreeId: context.worktreeId,
    key,
    label,
    note: request.note ?? null,
    codeLabel: request.code ? codeLabelFor(request.code, context.worktreePath) : null,
    target: request.target
  })
  if (!result.ok) {
    return result
  }
  putUiPageMark(target.pageId, result.url, {
    key,
    label,
    ownerTabId: context.ownerTabId,
    worktreeId: context.worktreeId,
    context,
    code: request.code ?? null
  })
  const visible =
    result.inViewport && isUiPageOnScreen(useAppStore.getState(), context.worktreeId, target)
  const several =
    result.matches > 1
      ? `; ${result.matches} elements matched (${result.visibleMatches} visible), marked the first ${result.visibleMatches > 0 ? 'visible ' : ''}one`
      : ''
  return {
    ok: true,
    visible,
    detail: `mark ${label} on page ${target.pageId} (${result.url})${several}`
  }
}

export async function clearUiMarks(context: AgentShowContext): Promise<void> {
  const removed = takeOwnerUiMarks(context.worktreeId, context.ownerTabId)
  const clear = window.api.browser.agentShowClearPageMarks
  if (!clear) {
    return
  }
  await Promise.all(Array.from(removed, ([browserPageId, keys]) => clear({ browserPageId, keys })))
}

export function uiStateFor(context: AgentShowContext): AgentShowState['browser'] {
  return uiPagesWithMarks(context.worktreeId)
}
