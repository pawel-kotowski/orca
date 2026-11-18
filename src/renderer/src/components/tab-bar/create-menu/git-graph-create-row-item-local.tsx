// Local (glass build): the workspace + menu's Git Graph item (Orca's Commits header has its own
// button). Hidden for a folder that is not a Git repository, and in terminal-only menus.
import { GitGraph } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import {
  openGitGraphTab,
  useGitGraphAvailable
} from '@/components/editor/git-graph/open-git-graph-tab'
import type { TabBarCreateRowItem } from './tab-bar-create-row-item'

// Persisted in newTabMenuLayout like upstream's ids; renaming it loses a saved placement.
export const CREATE_ROW_GIT_GRAPH_ID = 'git-graph'

export function useGitGraphCreateRowItems({
  worktreeId,
  groupId,
  terminalOnly,
  iconClassName
}: {
  worktreeId: string
  groupId: string
  terminalOnly: boolean
  iconClassName: string
}): TabBarCreateRowItem[] {
  const t = useTranslate()
  const available = useGitGraphAvailable(worktreeId)
  if (terminalOnly || !available) {
    return []
  }
  return [
    {
      id: CREATE_ROW_GIT_GRAPH_ID,
      label: t('local.gitGraph.title', 'Git Graph'),
      icon: <GitGraph className={iconClassName} />,
      run: () => openGitGraphTab(worktreeId, groupId)
    }
  ]
}
