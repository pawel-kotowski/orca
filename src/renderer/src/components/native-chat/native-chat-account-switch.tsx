import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { saveWorkspaceClaudeAccount } from '@/lib/workspace-claude-account'
import { makePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import { accountShortName } from './native-chat-account-usage'

/**
 * Move this chat to another Claude subscription (Paweł, 2026-11-09: "option to switch subscription
 * by clicking current sub"). The chat's workspace takes the account, so its next agents start on
 * it too, and the chat's Claude restarts on it, resuming the same conversation once its turn ends.
 */
function switchChatAccount(args: {
  worktreeId: string
  terminalTabId: string
  account: ClaudeManagedAccount
}): void {
  void (async () => {
    await saveWorkspaceClaudeAccount(args.worktreeId, args.account.id)
    const state = useAppStore.getState()
    const ptyIdsByLeafId = state.terminalLayoutsByTabId[args.terminalTabId]?.ptyIdsByLeafId ?? {}
    const ptyIds = Object.entries(ptyIdsByLeafId).flatMap(([leafId, ptyId]) =>
      ptyId &&
      state.agentStatusByPaneKey[makePaneKey(args.terminalTabId, leafId)]?.agentType === 'claude'
        ? [ptyId]
        : []
    )
    state.queuePaneAccountRestarts(ptyIds, 'claude')
    toast.success(
      translate('components.native-chat.account.switching', 'Moving this chat to {{name}}', {
        name: accountShortName(args.account.email)
      }),
      {
        description:
          ptyIds.length > 0
            ? translate(
                'components.native-chat.account.switchingRestart',
                'Claude restarts on it when its turn ends and picks the conversation up.'
              )
            : translate(
                'components.native-chat.account.switchingNext',
                'The next Claude in this workspace starts on it.'
              )
      }
    )
  })()
}

const NO_ACCOUNTS: readonly ClaudeManagedAccount[] = []

/** The subscription's name under the message box; a click lists the accounts to move to. */
export function NativeChatAccountSwitch({
  name,
  currentAccountId,
  worktreeId,
  terminalTabId
}: {
  name: string
  currentAccountId: string | null
  /** Null for a chat whose accounts this app does not manage (another machine's). */
  worktreeId: string | null
  terminalTabId: string
}): React.JSX.Element {
  const accounts = useAppStore((state) => state.settings?.claudeManagedAccounts) ?? NO_ACCOUNTS
  const nameStyle = { color: 'var(--chat-hue-blue, var(--chat-foreground-faint))' }
  if (!worktreeId || accounts.length < 2) {
    return (
      <span className="font-medium" style={nameStyle}>
        {name}
      </span>
    )
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring"
          style={nameStyle}
          aria-label={translate(
            'components.native-chat.account.switchLabel',
            'Claude subscription {{name}}: switch',
            { name }
          )}
        >
          {name}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuLabel>
          {translate('components.native-chat.account.switchTitle', 'Run this chat on')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            disabled={account.id === currentAccountId}
            onSelect={() => switchChatAccount({ worktreeId, terminalTabId, account })}
          >
            <Check
              className={account.id === currentAccountId ? 'size-3.5' : 'size-3.5 opacity-0'}
            />
            <span className="font-medium">{accountShortName(account.email)}</span>
            <span className="ml-auto truncate pl-3 text-muted-foreground">{account.email}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
