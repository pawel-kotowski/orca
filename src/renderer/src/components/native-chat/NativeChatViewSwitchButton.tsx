import { MessagesSquare, SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

/**
 * Switches one agent terminal between its terminal and its terminal-backed Chat UI, the same
 * view toggle as Cmd+Shift+J. It never resumes the session in a new SDK chat.
 */
export function NativeChatViewSwitchButton({
  to,
  onSwitch,
  className,
  style
}: {
  to: 'terminal' | 'chat'
  onSwitch: () => void
  className?: string
  style?: React.CSSProperties
}): React.JSX.Element {
  const label =
    to === 'terminal'
      ? translate('components.native-chat.toggle.showTerminal', 'Show terminal')
      : translate('components.native-chat.toggle.showChat', 'Show Chat UI')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="launcher"
          size="icon"
          aria-label={label}
          className={className}
          style={style}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            onSwitch()
          }}
        >
          {to === 'terminal' ? (
            <SquareTerminal className="size-4" />
          ) : (
            <MessagesSquare className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
