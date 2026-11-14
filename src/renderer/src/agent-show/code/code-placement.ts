import type { AgentShowPlacement } from '../../../../shared/agent-show/agent-show-contract'

export type CodePlacement =
  | { kind: 'group'; groupId: string; reusedForRoom?: boolean }
  | { kind: 'split'; sourceGroupId: string; direction: 'right' | 'down' }
  /** The window is too narrow for code beside the chat: a background tab in the chat's pane. */
  | { kind: 'background'; groupId: string }
  | { kind: 'default' }

export type CodePlacementInput = {
  place: AgentShowPlacement
  ownerGroupId: string | null
  /** Panes of the column beside the chat; null when there is none yet. */
  stageLeaves: readonly string[] | null
  /** Stage panes this agent used, most recent first. */
  usedByOwner: readonly string[]
  /** A stage column (new, or the existing one) leaves room for code at the floor font. */
  stageHasRoom: boolean
  /** Every pane of the current pane's stack, plus a new one, shows its range at the floor font. */
  roomBelow: boolean
  /** The current pane is wide enough to split into two columns of code. */
  roomRight: boolean
  /** Stage panes showing a browser page: code goes beside them, never over them. */
  pagePanes?: readonly string[]
}

/** The stage pane the agent works in now: the one it used last, else the stage's first. */
export function currentStagePane(
  stageLeaves: readonly string[],
  usedByOwner: readonly string[]
): string | null {
  return usedByOwner.find((id) => stageLeaves.includes(id)) ?? stageLeaves[0] ?? null
}

/**
 * Code goes in the column beside the chat, never in the chat's pane. beside: the current stage
 * pane; below/right: a split of it when every pane still shows its range, else the pane used
 * least recently; same: the pane used last. A pane showing a browser page keeps it: code goes to
 * another stage pane or stacks under the page. No owner tab: the editor's default.
 */
export function chooseCodePlacement(input: CodePlacementInput): CodePlacement {
  const { place, ownerGroupId, stageLeaves, usedByOwner, stageHasRoom } = input
  if (!ownerGroupId) {
    return { kind: 'default' }
  }
  if (!stageHasRoom) {
    return { kind: 'background', groupId: ownerGroupId }
  }
  const current = stageLeaves ? currentStagePane(stageLeaves, usedByOwner) : null
  if (!stageLeaves || !current) {
    return { kind: 'split', sourceGroupId: ownerGroupId, direction: 'right' }
  }
  if (place === 'right' && input.roomRight) {
    return { kind: 'split', sourceGroupId: current, direction: 'right' }
  }
  if ((place === 'right' || place === 'below') && input.roomBelow) {
    return { kind: 'split', sourceGroupId: current, direction: 'down' }
  }
  const pages = input.pagePanes ?? []
  if (place === 'right' || place === 'below') {
    const used = usedByOwner.filter((id) => stageLeaves.includes(id) && !pages.includes(id))
    return { kind: 'group', groupId: used.at(-1) ?? current, reusedForRoom: true }
  }
  if (!pages.includes(current)) {
    return { kind: 'group', groupId: current }
  }
  // Why: the agent is pointing at that page; its code goes next to it, not over it.
  const codePane =
    usedByOwner.find((id) => stageLeaves.includes(id) && !pages.includes(id)) ??
    stageLeaves.find((id) => !pages.includes(id))
  if (codePane) {
    return { kind: 'group', groupId: codePane }
  }
  // Why always: a short code pane says so in its fit, a covered page is just gone.
  return { kind: 'split', sourceGroupId: current, direction: 'down' }
}
