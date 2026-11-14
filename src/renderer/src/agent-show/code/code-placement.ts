import type { AgentShowPlacement } from '../../../../shared/agent-show/agent-show-contract'

export type CodePlacement =
  | { kind: 'group'; groupId: string }
  | { kind: 'split'; sourceGroupId: string; direction: 'right' | 'down' }
  | { kind: 'default' }

/** What a chat link would do next to the owner's tab (`resolveLinkOpenSidePlacement`). */
export type BesidePlacement = { groupId: string } | { split: { sourceGroupId: string } } | null

/**
 * beside: next to the owner's tab, as chat links open. right/below: a new split of the pane the
 * owner used last (else its own). same: the pane it used last (else beside).
 */
export function chooseCodePlacement(input: {
  place: AgentShowPlacement
  ownerGroupId: string | null
  /** Only when still in the layout. */
  lastGroupId: string | null
  beside: BesidePlacement
}): CodePlacement {
  const { place, ownerGroupId, lastGroupId, beside } = input
  if (place === 'right' || place === 'below') {
    const sourceGroupId = lastGroupId ?? ownerGroupId
    return sourceGroupId
      ? { kind: 'split', sourceGroupId, direction: place === 'right' ? 'right' : 'down' }
      : { kind: 'default' }
  }
  if (place === 'same' && lastGroupId) {
    return { kind: 'group', groupId: lastGroupId }
  }
  if (!beside) {
    return { kind: 'default' }
  }
  return 'groupId' in beside
    ? { kind: 'group', groupId: beside.groupId }
    : { kind: 'split', sourceGroupId: beside.split.sourceGroupId, direction: 'right' }
}
