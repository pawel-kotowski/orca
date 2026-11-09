// Local (glass build): the Commits header's button that opens the full-size Git Graph tab.
import React from 'react'
import { GitGraph } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

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
