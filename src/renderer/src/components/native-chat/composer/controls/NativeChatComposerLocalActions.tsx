import type { ReactNode } from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { getScreenSubmitShortcutLabel } from '@/lib/keyboard/screen-submit-shortcut'
import type { NativeChatFollowUpBehavior } from '../../../../../../shared/native-chat/input/native-chat-follow-up-behavior'

/**
 * Local build: Stop in the message box is red so it never reads like Send (Paweł, 2026-11-08), and
 * only a soft tint, since a solid red disc was too loud beside the draft (Paweł, 2026-11-10: "make
 * stop button in chat input less flashy less bright").
 */
export const NATIVE_CHAT_STOP_TINT =
  'bg-destructive/10 text-destructive/80 hover:bg-destructive/20 hover:text-destructive dark:bg-destructive/15 dark:text-red-300/80 dark:hover:bg-destructive/25 dark:hover:text-red-300'

/**
 * Local build: what Cmd/Ctrl+Enter does instead of a plain send (steer or queue), shown beside Send.
 * Why visible, not only in Send's tooltip: it must be seen while typing to a working agent (Paweł,
 * 2026-11-08: "i need to see that i have to press it").
 */
export function NativeChatAlternateSendChip({
  alternateSend,
  shortcut
}: {
  alternateSend: NativeChatFollowUpBehavior
  /** The chord where it is not Cmd/Ctrl+Enter: a terminal Claude's Ctrl+Enter, which sends now. */
  shortcut?: string
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <span
      data-native-chat-alternate-send={alternateSend}
      className="flex shrink-0 items-center gap-1 whitespace-nowrap text-2xs text-chat-foreground-faint"
    >
      <kbd className="rounded border border-chat-code-border px-1 font-sans text-3xs leading-4 text-chat-foreground">
        {shortcut ?? getScreenSubmitShortcutLabel()}
      </kbd>
      {alternateSend === 'steer'
        ? t('components.native-chat.composer.alternateSteerChip', 'steer')
        : t('components.native-chat.composer.alternateQueueChip', 'queue')}
    </span>
  )
}

/**
 * Local build: the one-line message box sits beside its text with only Attach, the option pickers
 * and Stop; upstream's toolbar (and its overflow measuring) is for the full-size box.
 */
export function NativeChatCompactComposerActions({
  leading,
  trailing
}: {
  leading: ReactNode
  trailing: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2 text-chat-foreground-faint">
      <div className="flex min-w-0 items-center gap-0.5">{leading}</div>
      <div className="ml-auto flex items-center gap-1.5">{trailing}</div>
    </div>
  )
}
