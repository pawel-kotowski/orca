import type { Tab, TabGroup, TabGroupLayoutNode } from '../../../../shared/tab-types'
import type {
  AgentShowLayout,
  AgentShowLayoutTab
} from '../../../../shared/agent-show/agent-show-contract'

export type AgentShowLayoutSource = {
  layoutByWorktree: Record<string, TabGroupLayoutNode | undefined>
  groupsByWorktree: Record<string, TabGroup[] | undefined>
  activeGroupIdByWorktree: Record<string, string | undefined>
  unifiedTabsByWorktree: Record<string, Tab[] | undefined>
}

const FILE_TAB_TYPES = new Set<Tab['contentType']>(['editor', 'diff', 'conflict-review'])

function leafGroupIds(node: TabGroupLayoutNode | undefined): string[] | null {
  if (!node) {
    return null
  }
  return node.type === 'leaf'
    ? [node.groupId]
    : [...(leafGroupIds(node.first) ?? []), ...(leafGroupIds(node.second) ?? [])]
}

/** The worktree's split layout as the window draws it: only groups in the layout tree are on screen. */
export function agentShowLayoutFor(
  source: AgentShowLayoutSource,
  worktreeId: string,
  ownerTabId: string | null
): AgentShowLayout {
  const root = source.layoutByWorktree[worktreeId] ?? null
  const groups = source.groupsByWorktree[worktreeId] ?? []
  const tabsById = new Map((source.unifiedTabsByWorktree[worktreeId] ?? []).map((t) => [t.id, t]))
  const drawn = leafGroupIds(root ?? undefined)
  const drawnGroups = drawn ? groups.filter((group) => drawn.includes(group.id)) : groups
  return {
    root,
    activeGroupId: source.activeGroupIdByWorktree[worktreeId] ?? null,
    groups: drawnGroups.map((group) => ({
      groupId: group.id,
      activeTabId: group.activeTabId,
      tabs: group.tabOrder.flatMap((tabId): AgentShowLayoutTab[] => {
        const tab = tabsById.get(tabId)
        if (!tab) {
          return []
        }
        return [
          {
            tabId: tab.id,
            contentType: tab.contentType,
            label: tab.customLabel ?? tab.label,
            filePath: FILE_TAB_TYPES.has(tab.contentType) ? tab.entityId : null,
            isOwner: ownerTabId !== null && tab.id === ownerTabId
          }
        ]
      })
    }))
  }
}

export function ownerTabIsActive(layout: AgentShowLayout, ownerTabId: string | null): boolean {
  return ownerTabId !== null && layout.groups.some((group) => group.activeTabId === ownerTabId)
}
