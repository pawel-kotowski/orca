import { NativeChatAccountUsageChip } from './native-chat-account-usage'
import { NativeChatViewSwitchButton } from './NativeChatViewSwitchButton'

/**
 * The quiet line under the message box: the Claude subscription and its limits, then the switch to
 * the agent's terminal. It eats into the box's bottom padding, so the box itself never moves.
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
    </div>
  )
}
