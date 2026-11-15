const quoted = (value: string): string => `"${value.replace(/["\\]/g, '\\$&')}"`

/** CSS that hides the code editor (and its note cards) in each held pane, nothing else. */
export function stageHoldRules(groupIds: readonly string[]): string {
  if (groupIds.length === 0) {
    return ''
  }
  const selectors = groupIds.map((id) => `[data-tab-group-body-id=${quoted(id)}] .monaco-editor`)
  return `${selectors.join(',\n')} { visibility: hidden; }`
}
