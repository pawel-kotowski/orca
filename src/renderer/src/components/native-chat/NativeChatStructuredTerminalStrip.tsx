import { SquareTerminal } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslate } from '@/i18n/use-translate'
import type { ChatTerminalHold } from './native-chat-structured-terminal-state'
import { useNativeChatAccountScope } from './native-chat-account-scope'
import {
  bringStructuredChatBack,
  showStructuredChatTerminal
} from './native-chat-structured-terminal'

/** While the chat's conversation runs in a terminal: where it is, and the way back. */
export function NativeChatStructuredTerminalStrip({
  terminal
}: {
  terminal: ChatTerminalHold | null
}): React.JSX.Element | null {
  const t = useTranslate()
  const scope = useNativeChatAccountScope()
  const [returning, setReturning] = useState(false)
  if (!terminal || scope?.kind !== 'structured') {
    return null
  }
  const { tabId } = terminal
  return (
    <div className="shrink-0 bg-chat-pane px-3 pt-1.5 sm:px-4">
      <div
        data-native-chat-surface="activity-line"
        data-native-chat-terminal-strip=""
        className="mx-auto flex w-full max-w-(--chat-content-max-width) flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border px-2.5 py-1 text-xs text-muted-foreground"
      >
        <SquareTerminal aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 text-chat-foreground">
          {t('components.native-chat.terminalSwitch.inTerminal', 'Open in a terminal')}
        </span>
        {tabId ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => showStructuredChatTerminal(tabId)}
          >
            {t('components.native-chat.terminalSwitch.show', 'Show terminal')}
          </Button>
        ) : null}
        {terminal.launching ? null : (
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={returning}
            onClick={() => {
              setReturning(true)
              void bringStructuredChatBack(scope, tabId).finally(() => setReturning(false))
            }}
          >
            {returning
              ? t('components.native-chat.terminalSwitch.returning', 'Bringing back…')
              : t('components.native-chat.terminalSwitch.back', 'Bring it back here')}
          </Button>
        )}
      </div>
    </div>
  )
}
