import { useLayoutEffect, useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { ProviderAccountChatButton } from '@/components/status-bar/accounts/ProviderAccountChatButton'
import { useNativeChatAccountScope } from '../native-chat-account-scope'
import { accountShortName } from '../native-chat-account-usage'
import { AccountSwitchMenu, structuredSwitchChoices } from '../native-chat-account-switch'
import {
  moveStructuredClaudeAccount,
  toastStructuredClaudeMove,
  useStructuredClaudeAccount
} from '../native-chat-structured-claude-account'
import { structuredClaudeUsage } from '../native-chat-structured-claude-usage'
import type { NativeChatOrcaStopView } from '../messages/notices/native-chat-orca-stop-context'

/**
 * The usage-limit row's account switch: the chat's own workspace moves, then the chat continues.
 * Null leaves the host-wide switcher to a host that cannot move one workspace.
 */
export function useStructuredUsageLimitAccount(
  offered: boolean,
  view: NativeChatOrcaStopView
): React.JSX.Element | null {
  const scope = useNativeChatAccountScope()
  const chat = offered && scope?.kind === 'structured' && scope.agent === 'claude' ? scope : null
  const usage = structuredClaudeUsage(useStructuredClaudeAccount(chat))
  const [moving, setMoving] = useState(false)
  const latest = useRef<NativeChatOrcaStopView | null>(view)
  useLayoutEffect(() => {
    latest.current = view
    return () => {
      latest.current = null
    }
  }, [view])
  if (!chat || !usage || usage.choices.length < 2) {
    return null
  }
  const moveAndContinue = async (accountId: string, email: string): Promise<void> => {
    const cut = view.usageLimitTurnItemId
    const name = accountShortName(email)
    setMoving(true)
    const result = await moveStructuredClaudeAccount(chat, accountId, name).finally(() =>
      setMoving(false)
    )
    if (result?.outcome === 'after_work') {
      toastStructuredClaudeMove('after_work', name)
    } else if (result && cut !== null && latest.current?.usageLimitTurnItemId === cut) {
      latest.current.continueUsageLimit()
    }
  }
  return (
    <AccountSwitchMenu
      name=""
      title={translate(
        'components.native-chat.usageLimitActions.continueOn',
        'Continue this chat on'
      )}
      note={translate(
        'components.native-chat.account.switchMovesWorkspace',
        "All of this workspace's chats move."
      )}
      trigger={
        <ProviderAccountChatButton
          provider="claude"
          target={chat.target}
          disabled={moving}
          busy={moving}
        />
      }
      choices={structuredSwitchChoices(usage, (accountId, email) => {
        void moveAndContinue(accountId, email)
      })}
    />
  )
}
