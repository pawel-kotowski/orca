/** `detail` words an agent can repeat to the user or act on. */
export function describeBackgroundTab(tabLabel: string): string {
  return `the window is too narrow for code beside the chat, so "${tabLabel}" opened as a background tab in the chat's pane; tell the user to switch to that tab (or widen the window), the chat stays in front`
}

export function describeReusedPane(): string {
  return 'no room for another pane with every range readable, so it replaced the pane you used least recently'
}
