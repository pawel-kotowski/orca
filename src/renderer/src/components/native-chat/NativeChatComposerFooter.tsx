import { NativeChatAccountUsageChip } from './native-chat-account-usage'
import { NativeChatViewSwitchButton } from './NativeChatViewSwitchButton'
import { NativeChatPlaceLine } from './native-chat-place-line'
import { NativeChatContextUsageChip } from './native-chat-context-usage-chip'
import type { NativeChatContextUsageSummary } from './native-chat-context-usage-summary'

/**
 * The quiet line under the message box: the Claude subscription and its limits, how full the
 * context window is, the switch to the
 * agent's terminal, and at the right where the chat runs (machine, project, workspace). It eats into the box's bottom padding, so the box itself never moves.
 */
export function NativeChatComposerFooter({
  onSwitchToTerminal,
  contextUsage
}: {
  onSwitchToTerminal?: () => void
  contextUsage?: NativeChatContextUsageSummary | null
}): React.JSX.Element {
  return (
    <div className="-mb-2 mt-1 flex items-center gap-2.5 px-3">
      <NativeChatAccountUsageChip />
      <NativeChatContextUsageChip usage={contextUsage} />
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
