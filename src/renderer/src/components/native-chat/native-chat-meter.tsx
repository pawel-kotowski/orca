import {
  USAGE_URGENT_PERCENT,
  USAGE_WARNING_PERCENT
} from '../status-bar/provider-extra-usage-section'

/**
 * How full a limit is, as the theme says it: green while there is room, yellow as it nears, red
 * near the end. The hues are the terminal palette's (native-chat-colors.css); with chat colour off
 * they fall back to the chat's faint text and the status bar's yellow and red.
 */
export function nativeChatMeterColor(
  usedPercent: number,
  warningPercent = USAGE_WARNING_PERCENT,
  urgentPercent = USAGE_URGENT_PERCENT
): string {
  if (usedPercent >= urgentPercent) {
    return 'var(--chat-hue-red, var(--color-red-500))'
  }
  if (usedPercent >= warningPercent) {
    return 'var(--chat-hue-yellow, var(--color-yellow-500))'
  }
  return 'var(--chat-hue-green, var(--chat-foreground-faint))'
}

/** A small square-cornered meter for the line under the message box (Paweł: "rectangular"). */
export function NativeChatMeter({
  label,
  usedPercent,
  warningPercent,
  urgentPercent
}: {
  label: string
  usedPercent: number
  warningPercent?: number
  urgentPercent?: number
}): React.JSX.Element {
  const used = Math.max(0, Math.min(100, usedPercent))
  return (
    <span
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(used)}
      className="h-1.5 w-9 overflow-hidden bg-chat-foreground-faint/20"
    >
      <span
        className="block h-full"
        style={{
          width: `${used}%`,
          backgroundColor: nativeChatMeterColor(used, warningPercent, urgentPercent)
        }}
      />
    </span>
  )
}
