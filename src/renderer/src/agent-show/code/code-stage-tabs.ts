import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store'
import { needsSavePromptOnClose } from '@/store/slices/editor/buffers/editor-buffer-close-rule'
import { codeMarkOwnerKey, ownerCodeMarks } from './code-mark-store'
import { signalAgentShowChange } from '../persistence/agent-show-change-signal'

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

/**
 * Opened tabs none of the owner's marks belong to any more, except `keepTabId`. A mark belongs
 * to the pane it was shown in; one without a pane belongs to every tab of its file.
 */
export function stageTabsToClose(
  openedTabs: ReadonlyMap<string, string>,
  marks: readonly { filePath: string; tabId?: string }[],
  keepTabId: string | null
): string[] {
  return [...openedTabs]
    .filter(
      ([tabId, filePath]) =>
        tabId !== keepTabId &&
        !marks.some((mark) => mark.tabId === tabId || (!mark.tabId && mark.filePath === filePath))
    )
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
  signalAgentShowChange()
}

export type StageSnapshot = {
  openedTabs: [string, string][]
  createdGroups: string[]
  usedGroups: string[]
  foldedSidebars: ('left' | 'right')[]
}

/** What an owner's shows opened, as plain data to persist. */
export function snapshotCodeStage(context: AgentShowContext): StageSnapshot {
  const stage = stageByOwner.get(codeMarkOwnerKey(context))
  return {
    openedTabs: [...(stage?.openedTabs ?? [])],
    createdGroups: [...(stage?.createdGroups ?? [])],
    usedGroups: [...(stage?.usedGroups ?? [])],
    foldedSidebars: [...(stage?.foldedSidebars ?? [])]
  }
}

/** Puts back what an owner's shows opened, keeping only tabs and panes that still exist. */
export function restoreCodeStage(context: AgentShowContext, snapshot: StageSnapshot): void {
  const state = useAppStore.getState()
  const tabIds = new Set((state.unifiedTabsByWorktree[context.worktreeId] ?? []).map((t) => t.id))
  const groupIds = new Set((state.groupsByWorktree[context.worktreeId] ?? []).map((g) => g.id))
  stageByOwner.set(codeMarkOwnerKey(context), {
    openedTabs: new Map(snapshot.openedTabs.filter(([tabId]) => tabIds.has(tabId))),
    createdGroups: new Set(snapshot.createdGroups.filter((id) => groupIds.has(id))),
    usedGroups: snapshot.usedGroups.filter((id) => groupIds.has(id)),
    foldedSidebars: new Set(snapshot.foldedSidebars)
  })
}

export function rememberStageGroupCreated(context: AgentShowContext, groupId: string): void {
  ownerStage(context).createdGroups.add(groupId)
  signalAgentShowChange()
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
  signalAgentShowChange()
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
  signalAgentShowChange()
}

/** Closes the tabs `orca show` opened whose marks are gone, and the panes that leaves empty. */
export function tidyCodeStage(context: AgentShowContext, keepTabId: string | null): void {
  const stage = stageByOwner.get(codeMarkOwnerKey(context))
  if (!stage) {
    return
  }
  const marks = [...(ownerCodeMarks(codeMarkOwnerKey(context)) ?? [])].flatMap(
    ([filePath, onFile]) => onFile.map((mark) => ({ filePath, tabId: mark.tabId }))
  )
  closeStageTabs(context.worktreeId, stage, stageTabsToClose(stage.openedTabs, marks, keepTabId))
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
  signalAgentShowChange()
}
