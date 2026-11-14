/** `detail` words an agent can repeat to the user or act on. */
export function describeBackgroundTab(tabLabel: string): string {
  return `the window is too narrow for code beside the chat, so "${tabLabel}" opened as a background tab in the chat's pane; tell the user to switch to that tab (or widen the window), the chat stays in front`
}

export function describeReusedPane(replacedLabel?: string, linesPerPane?: number): string {
  const room =
    linesPerPane === undefined
      ? ''
      : ` (stacked here, each pane holds about ${linesPerPane} lines plus its note)`
  const replaced = replacedLabel
    ? `the pane showing ${replacedLabel}, which stays there as a background tab and is no longer on screen`
    : 'the pane you used least recently'
  return `no room for another pane with every range readable${room}, so it replaced ${replaced}`
}
