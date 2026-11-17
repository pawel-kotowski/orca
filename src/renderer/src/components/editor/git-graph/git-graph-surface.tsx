// Local (glass build): a Git Graph tab shows the glass build's own Git Graph (GitGraphView: full
// names, the Branches view, lanes by branch, jumps, branch and author picks, find). Until
// 2026-11-17 the tab also offered upstream's Git Graph (#6746) behind a Classic / Orca view switch
// on a row of its own; Paweł had it removed ("remove orca view switch with the whole row"), and
// upstream's tab (git-graph-tab.tsx) stays in the source, unused here.
import React from 'react'
import { GitGraphView } from './GitGraphView'

export function GitGraphSurface({ worktreeId }: { worktreeId: string }): React.JSX.Element {
  return <GitGraphView worktreeId={worktreeId} />
}
