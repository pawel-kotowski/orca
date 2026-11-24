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
import type { ClaudeManagedAccount } from '../../../../shared/agent-accounts/managed-account-types'
import { accountShortName } from './native-chat-account-usage'
import { queueClaudeRestartsAtTurnEnd } from './native-chat-account-restart-at-turn-end'
import { useRemoteChatClaudeLogins } from './native-chat-remote-claude-logins'
import {
  moveStructuredClaudeAccount,
  toastStructuredClaudeMove
} from './native-chat-structured-claude-account'
import type { StructuredClaudeUsage } from './native-chat-structured-claude-usage'
import type { NativeChatStructuredAccountScope } from './native-chat-account-scope'

/**
 * Move this chat to another Claude subscription (Paweł, 2026-11-09: "option to switch subscription
 * by clicking current sub"). The chat's workspace takes the account, so its next agents start on
 * it too, and the chat's Claude restarts on it, resuming the same conversation once its turn ends.
 */
export function switchChatAccount(args: {
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
      state.agentStatusByPaneKey.get(makePaneKey(args.terminalTabId, leafId))?.agentType ===
        'claude'
        ? [ptyId]
        : []
    )
    queueClaudeRestartsAtTurnEnd(args.terminalTabId, ptyIds)
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

/** One login in the menu, whichever machine's it is. */
type SwitchChoice = {
  key: string
  name: string
  email: string
  current: boolean
  disabled: boolean
  /** Why it cannot be picked, in place of its email. */
  why?: string
  onSelect: () => void
}

/** The subscription's name under the message box; a click lists the accounts to move to. */
export function NativeChatAccountSwitch({
  name,
  currentAccountId,
  worktreeId,
  terminalTabId
}: {
  name: string
  currentAccountId: string | null
  /** Null for a chat whose accounts this app does not manage. */
  worktreeId: string | null
  terminalTabId: string
}): React.JSX.Element {
  const accounts = useAppStore((state) => state.settings?.claudeManagedAccounts) ?? NO_ACCOUNTS
  return (
    <AccountSwitchMenu
      name={name}
      choices={
        worktreeId
          ? accounts.map((account) => ({
              key: account.id,
              name: accountShortName(account.email),
              email: account.email,
              current: account.id === currentAccountId,
              disabled: account.id === currentAccountId,
              onSelect: () => switchChatAccount({ worktreeId, terminalTabId, account })
            }))
          : []
      }
    />
  )
}

/** The same menu for a chat on another machine: the logins that machine can run Claude on. */
export function NativeChatRemoteAccountSwitch({
  name,
  environmentId,
  terminalTabId,
  transcriptPath
}: {
  name: string
  environmentId: string
  terminalTabId: string
  transcriptPath: string | null
}): React.JSX.Element {
  const { logins, currentConfigDir, movingTo, backgroundWork, refresh, move } =
    useRemoteChatClaudeLogins({ environmentId, terminalTabId, transcriptPath })
  const target = logins.find((login) => login.configDir === movingTo)
  return (
    <AccountSwitchMenu
      name={name}
      movingTo={target ? accountShortName(target.email) : null}
      note={
        backgroundWork
          ? translate(
              'components.native-chat.account.switchStopsBackground',
              'Commands it runs in the background stop.'
            )
          : null
      }
      onOpen={refresh}
      choices={logins.map((login) => {
        const loginName = accountShortName(login.email)
        const current = login.configDir === currentConfigDir
        return {
          key: login.configDir,
          name: loginName,
          email: login.email,
          current,
          // While a move waits for the turn, picking the login it runs on calls the move off.
          disabled: movingTo === null ? current : login.configDir === movingTo,
          onSelect: () => move(login, loginName)
        }
      })}
    />
  )
}

/** The host's accounts as the menu lists them; while a move waits, the running one calls it off. */
export function structuredSwitchChoices(
  { shown, movingTo, choices }: StructuredClaudeUsage,
  onSelect: (accountId: string, email: string) => void
): SwitchChoice[] {
  // A login Orca does not manage names no account, so its email says which one it is.
  const runsOn = ({ accountId, email }: StructuredClaudeUsage['choices'][number]): boolean =>
    shown.accountId === null ? email === shown.email : accountId === shown.accountId
  const listed = choices.map((choice) => {
    const { accountId, email } = choice
    const current = runsOn(choice)
    return {
      key: accountId,
      name: accountShortName(email),
      email,
      current,
      disabled:
        choice.signedOut === true || (movingTo ? accountId === movingTo.accountId : current),
      ...(choice.signedOut && !current
        ? { why: translate('components.native-chat.account.signedOut', 'Signed out') }
        : {}),
      onSelect: () => onSelect(accountId, email)
    }
  })
  return listed.some(({ current }) => current) || !shown.email
    ? listed
    : [
        {
          key: 'running',
          name: accountShortName(shown.email),
          email: shown.email,
          current: true,
          disabled: true,
          onSelect: () => undefined
        },
        ...listed
      ]
}

/** The same menu for a structured chat, on this machine or a paired one: its host's accounts. */
export function NativeChatStructuredAccountSwitch({
  name,
  chat,
  usage
}: {
  name: string
  chat: NativeChatStructuredAccountScope
  usage: StructuredClaudeUsage
}): React.JSX.Element {
  const move = async (accountId: string, email: string): Promise<void> => {
    const target = accountShortName(email)
    const result = await moveStructuredClaudeAccount(chat, accountId, target)
    if (result) {
      toastStructuredClaudeMove(result.outcome, target)
    }
  }
  return (
    <AccountSwitchMenu
      name={name}
      movingTo={usage.movingTo?.email ? accountShortName(usage.movingTo.email) : null}
      note={translate(
        'components.native-chat.account.switchMovesWorkspace',
        "All of this workspace's chats move."
      )}
      choices={structuredSwitchChoices(usage, (accountId, email) => {
        void move(accountId, email)
      })}
    />
  )
}

export function AccountSwitchMenu({
  name,
  movingTo = null,
  note = null,
  title,
  trigger,
  choices,
  onOpen
}: {
  name: string
  movingTo?: string | null
  note?: string | null
  title?: string
  /** Opens the menu in place of the name. */
  trigger?: React.JSX.Element
  choices: readonly SwitchChoice[]
  onOpen?: () => void
}): React.JSX.Element {
  const nameStyle = { color: 'var(--chat-hue-blue, var(--chat-foreground-faint))' }
  const shown = movingTo ? `${name} \u2192 ${movingTo}` : name
  if (choices.length < 2) {
    return (
      <span className="font-medium" style={nameStyle}>
        {shown}
      </span>
    )
  }
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => (open ? onOpen?.() : undefined)}>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="cursor-pointer rounded font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-1 focus-visible:ring-ring"
            style={nameStyle}
            aria-label={translate(
              'components.native-chat.account.switchLabel',
              'Claude subscription {{name}}: switch',
              { name: shown }
            )}
          >
            {shown}
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuLabel>
          {title ?? translate('components.native-chat.account.switchTitle', 'Run this chat on')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {choices.map((choice) => (
          <DropdownMenuItem key={choice.key} disabled={choice.disabled} onSelect={choice.onSelect}>
            <Check className={choice.current ? 'size-3.5' : 'size-3.5 opacity-0'} />
            <span className="font-medium">{choice.name}</span>
            <span className="ml-auto truncate pl-3 text-muted-foreground">
              {choice.why ?? choice.email}
            </span>
          </DropdownMenuItem>
        ))}
        {note ? (
          <>
            <DropdownMenuSeparator />
            <p className="px-2 py-1 text-2xs text-muted-foreground">{note}</p>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
