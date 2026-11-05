import { NativeChatAccountUsageChip } from './native-chat-account-usage'
import { NativeChatViewSwitchButton } from './NativeChatViewSwitchButton'
import { NativeChatPlaceLine } from './native-chat-place-line'

/**
 * The quiet line under the message box: the Claude subscription and its limits, the switch to the
 * agent's terminal, and at the right where the chat runs (machine, project, workspace). It eats into the box's bottom padding, so the box itself never moves.
 */
export function NativeChatComposerFooter({
  onSwitchToTerminal
}: {
  onSwitchToTerminal?: () => void
}): React.JSX.Element {
  return (
    <div className="-mb-2 mt-1 flex items-center gap-2.5 px-3">
      <NativeChatAccountUsageChip />
      {onSwitchToTerminal ? (
        <NativeChatViewSwitchButton
          to="terminal"
          onSwitch={onSwitchToTerminal}
          variant="ghost"
          size="icon-xs"
          className="text-chat-foreground-faint hover:text-chat-foreground"
        />
      ) : null}
      <NativeChatPlaceLine />
    </div>
  )
}
