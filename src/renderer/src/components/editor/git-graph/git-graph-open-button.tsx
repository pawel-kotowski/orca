// Local (glass build): the Commits header's button and the workspace + menu's item that open the
// full-size Git Graph tab.
import React from 'react'
import { GitGraph } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { openGitGraphTab, useGitGraphAvailable } from './open-git-graph-tab'

export function GitGraphOpenButton({ onOpen }: { onOpen: () => void }): React.JSX.Element {
  const label = translate('local.gitGraph.open', 'Open Git Graph')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="my-auto h-auto w-auto p-0.5 text-muted-foreground hover:bg-transparent hover:text-foreground dark:hover:bg-transparent [&_svg]:size-3"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
        >
          <GitGraph className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

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
