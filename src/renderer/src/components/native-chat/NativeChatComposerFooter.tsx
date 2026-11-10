import { useLayoutEffect, useRef } from 'react'
import { registerNativeChatFooterSlot } from './native-chat-footer-slot'
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
  const footerSlotRef = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const slot = footerSlotRef.current
    return slot ? registerNativeChatFooterSlot(slot) : undefined
  }, [])
  return (
    // Why a container: the limit bars collapse to percentages when this line is narrow.
    // Why one line: the place takes what is left and truncates, instead of dropping to a second
    // line under the box (Paweł, 2026-11-09: "should use whole chat width when available"). A
    // narrow line already turns the limit bars into percentages.
    <div className="@container/chat-footer -mb-2 mt-1 flex flex-nowrap items-center gap-x-2.5 gap-y-1 px-3">
      <NativeChatAccountUsageChip />
      <NativeChatContextUsageChip usage={contextUsage} />
      {/* Workers and running shells put their chips here; their rows open above the box. */}
      <span
        ref={footerSlotRef}
        data-native-chat-footer-chips=""
        className="flex min-w-0 shrink-0 items-center gap-1 empty:hidden"
      />
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
