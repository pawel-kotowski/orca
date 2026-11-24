import { useEffect } from 'react'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { useAppStore } from '@/store'
import { useTranslate } from '@/i18n/use-translate'
import { structuredAgentSessionPaneKey } from '../../../../shared/agent-session/view/structured-agent-session-projection'
import { NativeChatViewSwitchButton } from './NativeChatViewSwitchButton'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'
import {
  openStructuredChatTerminal,
  showStructuredChatTerminal
} from './native-chat-structured-terminal'
import {
  registerStructuredTerminalSwitch,
  structuredTerminalSwitch,
  useStructuredChatTerminal
} from './native-chat-structured-terminal-state'

function useStructuredTerminalPress(scope: NativeChatStructuredAccountScope) {
  const paneKey = structuredAgentSessionPaneKey(scope.tabId, scope.sessionId)
  const terminal = useStructuredChatTerminal(scope.sessionId)
  // Nothing was said yet, so there is no conversation a terminal could resume.
  const started = useAppStore((state) =>
    Boolean(state.agentStatusByPaneKey.get(paneKey)?.providerSession)
  )
  const open = terminal?.tabId ?? null
  const press = useLatestHandler(() =>
    open ? showStructuredChatTerminal(open) : void openStructuredChatTerminal(scope)
  )
  return { mode: structuredTerminalSwitch(scope), started, open, press }
}

/** Cmd+Shift+J's switch of a chat, also while a prompt or a subagent has the message box's place. */
export function NativeChatStructuredTerminalKey({
  scope
}: {
  scope: NativeChatStructuredAccountScope
}): null {
  const { mode, started, press } = useStructuredTerminalPress(scope)
  // A copy per key press would litter a bot's workspace, so only a real switch takes the key.
  const takesKey = started && mode === 'same'
  useEffect(
    () => (takesKey ? registerStructuredTerminalSwitch(scope.tabId, press) : undefined),
    [takesKey, scope.tabId, press]
  )
  return null
}

/** A structured chat's terminal switch, in the same place as a terminal chat's. */
export function NativeChatStructuredTerminalButton({
  scope
}: {
  scope: NativeChatStructuredAccountScope
}): React.JSX.Element | null {
  const t = useTranslate()
  const { mode, started, open, press } = useStructuredTerminalPress(scope)
  if (!mode || !started) {
    return null
  }
  return (
    <NativeChatViewSwitchButton
      to="terminal"
      label={
        open
          ? undefined
          : mode === 'same'
            ? t(
                'components.native-chat.terminalSwitch.open',
                'Continue this conversation in a terminal'
              )
            : t(
                'components.native-chat.terminalSwitch.openCopy',
                'Open a copy in a terminal (this chat goes on here)'
              )
      }
      onSwitch={press}
      variant="ghost"
      size="icon-xs"
      className="text-chat-foreground-faint hover:text-chat-foreground"
    />
  )
}
