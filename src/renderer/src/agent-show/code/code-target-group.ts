import type {
  AgentShowContext,
  AgentShowPlacement
} from '../../../../shared/agent-show/agent-show-contract'
import type { AppState } from '@/store/types'
import { useAppStore } from '@/store'
import { liveLinkOpenGroupIds } from '@/lib/links/placement/link-open-intent'
import { chooseCodePlacement, currentStagePane } from './code-placement'
import { findCodeStage, stackSplitRatios, verticalStackAround } from './code-stage'
import {
  CHAT_SHARE_BESIDE_STAGE,
  markedPaneNeedPx,
  measureStageRoom,
  newPaneNeedForRatio,
  stagePaneNeedForRatio
} from './code-stage-room'
import { ownerOpenedTab, rememberStageGroupCreated, stagePanesUsedBy } from './code-stage-tabs'
import { makeRoomForStage } from './code-stage-sidebars'

export type CodeTarget = {
  /** undefined: the editor's default group (no owner tab). */
  groupId: string | undefined
  /** The window is too narrow for a stage: a background tab in the chat's pane. */
  background: boolean
  /** A split was wanted but would leave a range unreadable, so a used pane was reused. */
  reusedForRoom: boolean
}

export type CodeTargetRequest = {
  place: AgentShowPlacement
  lines: number
  note?: string
  keepOthers: boolean
}

function ownerGroupOf(state: AppState, context: AgentShowContext): string | null {
  const { worktreeId, ownerTabId } = context
  if (!ownerTabId) {
    return null
  }
  const ownerTab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (tab) => tab.id === ownerTabId || tab.entityId === ownerTabId
  )
  return ownerTab && liveLinkOpenGroupIds(state, worktreeId).has(ownerTab.groupId)
    ? ownerTab.groupId
    : null
}

/**
 * Sizes the stage panes stacked with `groupId` by what each range needs, so a 30-line hop gets
 * more height than a 10-line one. `newNeedPx` stands in for a pane whose editor is not open yet.
 */
export function sizeCodeStageStack(
  context: AgentShowContext,
  groupId: string,
  newNeedPx?: number
): void {
  const state = useAppStore.getState()
  const layout = state.layoutByWorktree[context.worktreeId]
  const ownerGroupId = ownerGroupOf(state, context)
  const stage = layout && ownerGroupId ? findCodeStage(layout, ownerGroupId) : null
  const stack = layout && stage ? verticalStackAround(layout, stage.path, groupId) : null
  if (!layout || !stack || stack.leaves.length < 2) {
    return
  }
  const groups = state.groupsByWorktree[context.worktreeId] ?? []
  const ratios = stackSplitRatios(layout, stack.path, (id) =>
    id === groupId && newNeedPx !== undefined
      ? newNeedPx
      : stagePaneNeedForRatio(groups.find((group) => group.id === id)?.activeTabId ?? null)
  )
  for (const { path, ratio } of ratios) {
    state.setTabGroupSplitRatio(context.worktreeId, path, ratio)
  }
}

/** A new stage takes more of the width than the chat it splits from. */
function giveStageItsWidth(context: AgentShowContext, ownerGroupId: string): void {
  const state = useAppStore.getState()
  const layout = state.layoutByWorktree[context.worktreeId]
  const stage = layout ? findCodeStage(layout, ownerGroupId) : null
  if (stage) {
    state.setTabGroupSplitRatio(
      context.worktreeId,
      stage.path.slice(0, -1).join('.'),
      CHAT_SHARE_BESIDE_STAGE
    )
  }
}

/** The group a show request opens into, beside the chat, creating the stage or its split. */
export function resolveCodeTarget(
  context: AgentShowContext,
  request: CodeTargetRequest,
  focus: boolean
): CodeTarget {
  const state = useAppStore.getState()
  const { worktreeId } = context
  const ownerGroupId = ownerGroupOf(state, context)
  const none = { groupId: undefined, background: false, reusedForRoom: false }
  if (!ownerGroupId) {
    return none
  }
  const layout = state.layoutByWorktree[worktreeId]
  const live = liveLinkOpenGroupIds(state, worktreeId)
  const stage = layout ? findCodeStage(layout, ownerGroupId) : null
  const used = stagePanesUsedBy(context).filter((id) => live.has(id))
  const groups = state.groupsByWorktree[worktreeId] ?? []
  const measure = (extraWidthPx: number) =>
    measureStageRoom({
      extraWidthPx,
      state,
      layout,
      ownerGroupId,
      stage,
      currentPane: stage ? currentStagePane(stage.leaves, used) : null,
      newRange: { lines: request.lines, note: request.note },
      paneNeedPx: (groupId) => {
        const group = groups.find((candidate) => candidate.id === groupId)
        const ours = group?.tabOrder.every((tabId) => ownerOpenedTab(context, tabId)) ?? false
        if (!request.keepOthers) {
          // Why: a pane holding only tabs this show replaces closes after it.
          return ours ? null : markedPaneNeedPx(null)
        }
        return markedPaneNeedPx(group?.activeTabId ?? null)
      }
    })
  const room = focus ? makeRoomForStage(state, context, measure) : measure(0)
  const placement = chooseCodePlacement({
    place: request.place,
    ownerGroupId,
    stageLeaves: stage?.leaves ?? null,
    usedByOwner: used,
    ...room
  })
  if (placement.kind === 'default') {
    return none
  }
  if (placement.kind === 'background') {
    return { groupId: placement.groupId, background: true, reusedForRoom: false }
  }
  if (placement.kind === 'group') {
    return {
      groupId: placement.groupId,
      background: false,
      reusedForRoom: placement.reusedForRoom === true
    }
  }
  const created = state.createEmptySplitGroup(
    worktreeId,
    placement.sourceGroupId,
    placement.direction,
    { activate: focus }
  )
  if (!created) {
    return none
  }
  rememberStageGroupCreated(context, created)
  if (placement.sourceGroupId === ownerGroupId) {
    giveStageItsWidth(context, ownerGroupId)
  }
  if (placement.direction === 'down') {
    sizeCodeStageStack(context, created, newPaneNeedForRatio(state, request.lines, request.note))
  }
  return { groupId: created, background: false, reusedForRoom: false }
}
