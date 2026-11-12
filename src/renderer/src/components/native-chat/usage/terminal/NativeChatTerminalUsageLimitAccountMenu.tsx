import { ArrowLeftRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/rpc/targets/runtime-client-target'
import type { ClaudeManagedAccount } from '../../../../../../shared/managed-account-types'
import {
  accountShortName,
  resolveChatClaudeAccount,
  worktreeIdForTab
} from '../../native-chat-account-usage'

const NO_ACCOUNTS: readonly ClaudeManagedAccount[] = []

/**
 * The usage-limit row's account picker for a terminal chat: the chat's workspace moves to the
 * chosen account and its Claude restarts there. Only this machine's accounts can be switched, so a
 * remote host's chat shows none.
 */
export function NativeChatTerminalUsageLimitAccountMenu({
  terminalTabId,
  transcriptPath,
  waitingOn,
  onSwitch
}: {
  terminalTabId: string
  transcriptPath: string | null
  /** The account a switch is waiting to continue on, while it waits. */
  waitingOn: string | null
  onSwitch: (worktreeId: string, account: ClaudeManagedAccount) => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const worktreeId = useAppStore((s) => worktreeIdForTab(s.tabsByWorktree, terminalTabId))
  const local = useAppStore(
    (s) =>
      worktreeId !== null &&
      runtimeRpcTargetForAuthorityKey(getExecutionHostIdForWorktree(s, worktreeId))?.kind ===
        'local'
  )
  const accounts = useAppStore((s) => s.settings?.claudeManagedAccounts) ?? NO_ACCOUNTS
  const current = useAppStore((s) =>
    resolveChatClaudeAccount({
      transcriptPath,
      worktreeId,
      accounts: s.settings?.claudeManagedAccounts ?? NO_ACCOUNTS,
      accountByWorktreeId: s.settings?.claudeAccountByWorktreeId,
      activeAccountId: s.settings?.activeClaudeManagedAccountId ?? null
    })
  )
  if (!worktreeId || !local || accounts.length < 2) {
    return null
  }
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="w-full"
          disabled={waitingOn !== null}
        >
          <ArrowLeftRight />
          <span className="truncate">
            {waitingOn === null
              ? t('components.native-chat.usageLimitActions.switchAccount', 'Switch Account')
              : t('components.native-chat.usageLimitActions.continuingOn', 'Moving to {{name}}', {
                  name: waitingOn
                })}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuLabel>
          {t('components.native-chat.usageLimitActions.continueOn', 'Continue this chat on')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            disabled={account.id === current?.id}
            onSelect={() => onSwitch(worktreeId, account)}
          >
            <Check className={account.id === current?.id ? 'size-3.5' : 'size-3.5 opacity-0'} />
            <span className="font-medium">{accountShortName(account.email)}</span>
            <span className="ml-auto truncate pl-3 text-muted-foreground">{account.email}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
