// Local (glass build): the workspace + menu's item that opens the Git Graph tab (Orca's Commits
// header has its own button).
import React from 'react'
import { GitGraph } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { openGitGraphTab, useGitGraphAvailable } from './open-git-graph-tab'

/** The workspace + menu's Git Graph item; hidden for a folder that is not a Git repository. */
export function GitGraphCreateMenuItem({
  worktreeId,
  groupId
}: {
  worktreeId: string
  groupId: string
}): React.JSX.Element | null {
  const available = useGitGraphAvailable(worktreeId)
  if (!available) {
    return null
  }
  return (
    <DropdownMenuItem
      onSelect={() => openGitGraphTab(worktreeId, groupId)}
      className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <GitGraph className="size-4 text-muted-foreground" />
      {translate('local.gitGraph.title', 'Git Graph')}
    </DropdownMenuItem>
  )
}
