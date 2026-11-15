const quoted = (value: string): string => `"${value.replace(/["\\]/g, '\\$&')}"`

/**
 * CSS that hides each held pane's content and tab strip: what shows through its still copy (an
 * unfocused pane is dimmed) is then the backdrop the pane had, not the new layout staging below.
 */
export function stageHoldRules(groupIds: readonly string[]): string {
  if (groupIds.length === 0) {
    return ''
  }
  const selectors = groupIds.flatMap((id) => [
    `[data-tab-group-body-id=${quoted(id)}]`,
    `[data-tab-group-strip-id=${quoted(id)}]`
  ])
  return `${selectors.join(',\n')} { visibility: hidden; }`
}
