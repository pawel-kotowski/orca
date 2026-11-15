/**
 * Whether the stage folds the right sidebar to make room for code: only while it shows no lit
 * folders, and never while it shows the Tours panel the user is stepping through.
 */
export function stageFoldsRightSidebar(sidebar: {
  open: boolean
  tab: string
  foldersLit: boolean
}): boolean {
  return sidebar.open && !sidebar.foldersLit && sidebar.tab !== 'tours'
}
