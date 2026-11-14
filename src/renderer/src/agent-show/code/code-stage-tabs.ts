import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store'
import { needsSavePromptOnClose } from '@/store/slices/editor/buffers/editor-buffer-close-rule'
import { codeMarkOwnerKey, ownerCodeMarks } from './code-mark-store'

/** What `orca show` put on screen for one owner: only these are ever closed. */
type OwnerStage = {
  /** Tab id → absolute file path, for tabs the user did not already have open. */
  openedTabs: Map<string, string>
  createdGroups: Set<string>
  /** Stage panes this owner used, most recent first. */
  usedGroups: string[]
  /** Sidebars folded to make room; `clear` opens them again. */
  foldedSidebars: Set<'left' | 'right'>
}

const stageByOwner = new Map<string, OwnerStage>()

function ownerStage(context: AgentShowContext): OwnerStage {
  const key = codeMarkOwnerKey(context)
  let stage = stageByOwner.get(key)
  if (!stage) {
    stage = {
      openedTabs: new Map(),
      createdGroups: new Set(),
      usedGroups: [],
      foldedSidebars: new Set()
    }
    stageByOwner.set(key, stage)
  }
  return stage
}

/** Opened tabs whose file no longer carries any of the owner's marks, except `keepTabId`. */
export function stageTabsToClose(
  openedTabs: ReadonlyMap<string, string>,
  markedFiles: ReadonlySet<string>,
  keepTabId: string | null
): string[] {
  return [...openedTabs]
    .filter(([tabId, filePath]) => tabId !== keepTabId && !markedFiles.has(filePath))
    .map(([tabId]) => tabId)
}

export function stagePanesUsedBy(context: AgentShowContext): readonly string[] {
  return stageByOwner.get(codeMarkOwnerKey(context))?.usedGroups ?? []
}

export function ownerOpenedTab(context: AgentShowContext, tabId: string): boolean {
  return stageByOwner.get(codeMarkOwnerKey(context))?.openedTabs.has(tabId) ?? false
}

export function rememberSidebarFolded(context: AgentShowContext, side: 'left' | 'right'): void {
  ownerStage(context).foldedSidebars.add(side)
}

export function rememberStageGroupCreated(context: AgentShowContext, groupId: string): void {
  ownerStage(context).createdGroups.add(groupId)
}

export function rememberStageTab(
  context: AgentShowContext,
  tab: { tabId: string; groupId: string; filePath: string; openedByShow: boolean }
): void {
  const stage = ownerStage(context)
  stage.usedGroups = [tab.groupId, ...stage.usedGroups.filter((id) => id !== tab.groupId)]
  if (tab.openedByShow) {
    stage.openedTabs.set(tab.tabId, tab.filePath)
  }
}

function closeStageTabs(worktreeId: string, stage: OwnerStage, tabIds: readonly string[]): void {
  const store = useAppStore.getState()
  const live = store.unifiedTabsByWorktree[worktreeId] ?? []
  for (const tabId of tabIds) {
    stage.openedTabs.delete(tabId)
    const tab = live.find((candidate) => candidate.id === tabId)
    // Why: an edited buffer is the user's now; closing it would ask them to save.
    if (tab && !needsSavePromptOnClose(useAppStore.getState(), tab.entityId)) {
      useAppStore.getState().closeUnifiedTab(tabId, { preserveWorktreeSelection: true })
    }
  }
  for (const groupId of stage.createdGroups) {
    const exists = useAppStore
      .getState()
      .groupsByWorktree[worktreeId]?.some((group) => group.id === groupId)
    if (!exists || useAppStore.getState().closeEmptyGroup(worktreeId, groupId)) {
      stage.createdGroups.delete(groupId)
    }
  }
  const groups = new Set(
    (useAppStore.getState().groupsByWorktree[worktreeId] ?? []).map((group) => group.id)
  )
  stage.usedGroups = stage.usedGroups.filter((id) => groups.has(id))
}

/** Closes the tabs `orca show` opened whose marks are gone, and the panes that leaves empty. */
export function tidyCodeStage(context: AgentShowContext, keepTabId: string | null): void {
  const stage = stageByOwner.get(codeMarkOwnerKey(context))
  if (!stage) {
    return
  }
  const marked = new Set(ownerCodeMarks(codeMarkOwnerKey(context))?.keys() ?? [])
  closeStageTabs(context.worktreeId, stage, stageTabsToClose(stage.openedTabs, marked, keepTabId))
}

/** `orca show clear`: every tab and pane this owner's shows opened goes. */
export function clearCodeStage(context: AgentShowContext): void {
  const key = codeMarkOwnerKey(context)
  const stage = stageByOwner.get(key)
  if (!stage) {
    return
  }
  closeStageTabs(context.worktreeId, stage, [...stage.openedTabs.keys()])
  if (stage.foldedSidebars.has('left')) {
    useAppStore.getState().setSidebarOpen(true)
  }
  if (stage.foldedSidebars.has('right')) {
    useAppStore.getState().setRightSidebarOpen(true)
  }
  stageByOwner.delete(key)
}
