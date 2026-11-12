import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'
import { NativeChatMeter } from './native-chat-meter'
import {
  formatContextTokenCount,
  type NativeChatContextUsageSummary
} from '../../../../shared/native-chat/native-chat-context-usage-summary'

/** Past this the window is nearly spent, as the composer's ring marks it. */
const CRITICAL_PERCENTAGE = 90

/** How full the chat's context window is, as a percentage on the quiet line under the message box. */
export function NativeChatContextUsageChip({
  usage
}: {
  usage: NativeChatContextUsageSummary | null | undefined
}): React.JSX.Element | null {
  if (!usage) {
    return null
  }
  const detail = [
    translate(
      'components.native-chat.contextUsage.label',
      'Context {{used}} of {{window}} tokens, {{percent}}% used',
      {
        used: formatContextTokenCount(usage.usedTokens),
        window: formatContextTokenCount(usage.windowTokens),
        percent: String(usage.percentage)
      }
    ),
    usage.estimated
      ? translate(
          'components.native-chat.contextUsage.estimated',
          'Estimated from the last response.'
        )
      : null
  ].filter((line): line is string => line !== null)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-native-chat-context-chip={usage.percentage}
          className={cn(
            'flex items-center gap-1 whitespace-nowrap text-2xs tabular-nums text-chat-foreground-faint',
            usage.percentage >= CRITICAL_PERCENTAGE && 'text-destructive'
          )}
        >
          <span>{translate('components.native-chat.contextUsage.short', 'ctx')}</span>
          <NativeChatMeter
            label={translate('components.native-chat.contextUsage.short', 'ctx')}
            usedPercent={usage.percentage}
            warningPercent={70}
            urgentPercent={CRITICAL_PERCENTAGE}
            percentWhenNarrow={false}
          />
          <span
            className={usage.percentage >= CRITICAL_PERCENTAGE ? undefined : 'text-chat-foreground'}
          >
            {usage.percentage}%
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="whitespace-pre-line">
        {detail.join('\n')}
      </TooltipContent>
    </Tooltip>
  )
}
