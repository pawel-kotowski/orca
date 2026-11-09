import { NativeChatAccountUsageChip } from './native-chat-account-usage'
import { NativeChatViewSwitchButton } from './NativeChatViewSwitchButton'
import { NativeChatPlaceLine } from './native-chat-place-line'
import { NativeChatResumeButton } from './native-chat-resume-button'
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
    // Why a container: the limit bars collapse to percentages when this line is narrow.
    <div className="@container/chat-footer -mb-2 mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3">
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
      <NativeChatResumeButton />
      <NativeChatPlaceLine />
    </div>
  )
}
