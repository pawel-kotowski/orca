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
 * Null leaves the host-wide switcher to a host that cannot move one workspace; until the host has
 * said, the button only waits, so a press never moves every workspace by mistake.
 */
export function useStructuredUsageLimitAccount(
  offered: boolean,
  view: NativeChatOrcaStopView
): React.JSX.Element | null | false {
  const scope = useNativeChatAccountScope()
  const chat = offered && scope?.kind === 'structured' && scope.agent === 'claude' ? scope : null
  const account = useStructuredClaudeAccount(chat)
  const usage = structuredClaudeUsage(account)
  const [moving, setMoving] = useState(false)
  const latest = useRef<NativeChatOrcaStopView | null>(view)
  useLayoutEffect(() => {
    latest.current = view
    return () => {
      latest.current = null
    }
  }, [view])
  if (!chat || account?.status === 'unsupported') {
    return null
  }
  if (!usage) {
    return <ProviderAccountChatButton provider="claude" target={chat.target} disabled busy />
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
  const choices = structuredSwitchChoices(usage, (accountId, email) => {
    void moveAndContinue(accountId, email)
  })
  if (!choices.some(({ disabled }) => !disabled)) {
    // Nowhere to move to: no button, and never the one that moves every workspace.
    return false
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
      choices={choices}
    />
  )
}
