import type {
  AgentShowContext,
  AgentShowPlacement
} from '../../../../shared/agent-show/agent-show-contract'
import type { AppState } from '@/store/types'
import { useAppStore } from '@/store'
import { resolveLinkOpenSidePlacement } from '@/lib/links/placement/adjacent-link-open-group'
import { liveLinkOpenGroupIds } from '@/lib/links/placement/link-open-intent'
import { chooseCodePlacement } from './code-placement'
import { codeMarkOwnerKey } from './code-mark-store'

const lastGroupByOwner = new Map<string, string>()

export function rememberOwnerGroup(context: AgentShowContext, groupId: string): void {
  lastGroupByOwner.set(codeMarkOwnerKey(context), groupId)
}

/** The group a show request opens into, creating its split; undefined = the editor's default. */
export function resolveCodeTargetGroup(
  context: AgentShowContext,
  place: AgentShowPlacement,
  focus: boolean
): string | undefined {
  const state: AppState = useAppStore.getState()
  const { worktreeId, ownerTabId } = context
  const live = liveLinkOpenGroupIds(state, worktreeId)
  const ownerTab = ownerTabId
    ? state.unifiedTabsByWorktree[worktreeId]?.find(
        (tab) => tab.id === ownerTabId || tab.entityId === ownerTabId
      )
    : undefined
  const ownerGroupId = ownerTab && live.has(ownerTab.groupId) ? ownerTab.groupId : null
  const remembered = lastGroupByOwner.get(codeMarkOwnerKey(context))
  const placement = chooseCodePlacement({
    place,
    ownerGroupId,
    lastGroupId: remembered && live.has(remembered) ? remembered : null,
    beside: ownerGroupId
      ? resolveLinkOpenSidePlacement({
          layout: state.layoutByWorktree[worktreeId],
          groups: state.groupsByWorktree[worktreeId] ?? [],
          sourceGroupId: ownerGroupId
        })
      : null
  })
  // Why: code opened in the chat's own pane hides the chat; split beside it instead.
  if (placement.kind === 'group' && placement.groupId === ownerGroupId) {
    return (
      state.createEmptySplitGroup(worktreeId, placement.groupId, 'right', { activate: focus }) ??
      undefined
    )
  }
  if (placement.kind === 'group') {
    return placement.groupId
  }
  if (placement.kind === 'split') {
    return (
      state.createEmptySplitGroup(worktreeId, placement.sourceGroupId, placement.direction, {
        activate: focus
      }) ?? undefined
    )
  }
  return undefined
}
