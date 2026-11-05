import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useAppStore } from '@/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useResetCountdownClock } from '@/hooks/useResetCountdownClock'
import { translate } from '@/i18n/i18n'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import { formatRateLimitWindowChipLabel } from '../../../../shared/rate-limit-window-label'
import { workspaceClaudeAccountId } from '../../../../shared/claude-workspace-account'

/** Which chat the message box belongs to, so its controls can show that chat's Claude account. */
export type NativeChatAccountScope = {
  agent: string
  transcriptPath: string | null
  terminalTabId: string
}

const NativeChatAccountScopeContext = createContext<NativeChatAccountScope | null>(null)

export function NativeChatAccountScopeProvider({
  agent,
  transcriptPath,
  terminalTabId,
  children
}: NativeChatAccountScope & { children: ReactNode }): React.JSX.Element {
  const value = useMemo(
    () => ({ agent, transcriptPath, terminalTabId }),
    [agent, transcriptPath, terminalTabId]
  )
  return (
    <NativeChatAccountScopeContext.Provider value={value}>
      {children}
    </NativeChatAccountScopeContext.Provider>
  )
}

const PROFILE_PATH =
  /\/claude-profiles\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i

/**
 * The managed account a Claude transcript was written under. Orca runs each managed account from
 * its own home (`claude-profiles/<id>/home`), so the transcript's place says which account the
 * session really runs on, whatever the settings say now.
 */
export function accountIdFromTranscriptPath(transcriptPath: string | null): string | null {
  return transcriptPath ? (PROFILE_PATH.exec(transcriptPath)?.[1]?.toLowerCase() ?? null) : null
}

// A mailbox anyone can have says nothing about the subscription; the account is the person's own.
const PERSONAL_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'yahoo.com',
  'proton.me',
  'protonmail.com',
  'aol.com',
  'gmx.com',
  'wp.pl',
  'o2.pl',
  'onet.pl',
  'interia.pl'
])

/** A short name for a subscription: its organisation's domain ("moshealth"), or "personal". */
export function accountShortName(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  if (!domain || PERSONAL_MAIL_DOMAINS.has(domain)) {
    return translate('components.native-chat.account.personal', 'personal')
  }
  return domain.split('.')[0] ?? domain
}

/** The chat's account: its transcript's home, else its workspace's account, else the active one. */
export function resolveChatClaudeAccount(input: {
  transcriptPath: string | null
  worktreeId: string | null
  accounts: readonly ClaudeManagedAccount[]
  accountByWorktreeId: Record<string, string> | undefined
  activeAccountId: string | null
}): ClaudeManagedAccount | null {
  const byId = (id: string | null): ClaudeManagedAccount | null =>
    (id && input.accounts.find((account) => account.id === id)) || null
  const fromTranscript = byId(accountIdFromTranscriptPath(input.transcriptPath))
  if (fromTranscript) {
    return fromTranscript
  }
  // Why: a transcript in the system home ran on the system default login, whose usage Orca reads
  // only when it is the active selection.
  if (input.transcriptPath && !input.activeAccountId) {
    return null
  }
  return (
    byId(
      workspaceClaudeAccountId(
        {
          claudeManagedAccounts: [...input.accounts],
          claudeAccountByWorktreeId: input.accountByWorktreeId
        },
        input.worktreeId
      )
    ) ?? byId(input.activeAccountId)
  )
}

function worktreeIdForTab(
  tabsByWorktree: Record<string, readonly { id: string }[]>,
  tabId: string
): string | null {
  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
    if (tabs.some((tab) => tab.id === tabId)) {
      return worktreeId
    }
  }
  return null
}

// Why one shared clock: every open chat would otherwise ask main for the other accounts' usage.
let lastInactiveFetchAt = Number.NEGATIVE_INFINITY
const INACTIVE_REFRESH_MS = 5 * 60 * 1000

function useChatClaudeUsage(scope: NativeChatAccountScope): {
  account: ClaudeManagedAccount
  limits: ProviderRateLimits | null
} | null {
  const account = useAppStore((state) =>
    resolveChatClaudeAccount({
      transcriptPath: scope.transcriptPath,
      worktreeId: worktreeIdForTab(state.tabsByWorktree, scope.terminalTabId),
      accounts: state.settings?.claudeManagedAccounts ?? [],
      accountByWorktreeId: state.settings?.claudeAccountByWorktreeId,
      activeAccountId: state.settings?.activeClaudeManagedAccountId ?? null
    })
  )
  const isActive = useAppStore(
    (state) => account !== null && state.settings?.activeClaudeManagedAccountId === account.id
  )
  const limits = useAppStore((state) =>
    account === null
      ? null
      : isActive
        ? state.rateLimits.claude
        : (state.rateLimits.inactiveClaudeAccounts.find((entry) => entry.accountId === account.id)
            ?.rateLimits ?? null)
  )
  const needsFetch = account !== null && !isActive
  useEffect(() => {
    if (!needsFetch || window.performance.now() - lastInactiveFetchAt < INACTIVE_REFRESH_MS) {
      return
    }
    lastInactiveFetchAt = window.performance.now()
    void useAppStore.getState().fetchInactiveClaudeAccountUsage()
  }, [needsFetch])
  return account ? { account, limits } : null
}

function windowText(window: RateLimitWindow, now: number): string {
  return `${Math.round(window.usedPercent)}% ${formatRateLimitWindowChipLabel(window, now)}`
}

/**
 * The Claude subscription this chat runs on and how much of its session (5 h) and weekly limits
 * are used, e.g. "robotec · 12% 3h 10m · wk 22% 2d 21h", on a quiet line under the message box.
 */
export function NativeChatAccountUsageChip(): React.JSX.Element | null {
  const scope = useContext(NativeChatAccountScopeContext)
  if (!scope || scope.agent !== 'claude') {
    return null
  }
  return <ClaudeAccountUsageChip scope={scope} />
}

function ClaudeAccountUsageChip({
  scope
}: {
  scope: NativeChatAccountScope
}): React.JSX.Element | null {
  const usage = useChatClaudeUsage(scope)
  const session = usage?.limits?.session ?? null
  const weekly = usage?.limits?.weekly ?? null
  const now = useResetCountdownClock([session?.resetsAt, weekly?.resetsAt])
  if (!usage) {
    return null
  }
  const name = accountShortName(usage.account.email)
  const weekLabel = translate('components.native-chat.account.week', 'wk')
  const parts = [
    name,
    session ? windowText(session, now) : null,
    weekly ? `${weekLabel} ${windowText(weekly, now)}` : null
  ].filter((part): part is string => part !== null)
  const detail = [
    translate('components.native-chat.account.detail', 'Claude account {{email}}', {
      email: usage.account.email
    }),
    session
      ? translate(
          'components.native-chat.account.session',
          'Session (5 h): {{used}}% used, resets in {{reset}}',
          {
            used: Math.round(session.usedPercent),
            reset: formatRateLimitWindowChipLabel(session, now)
          }
        )
      : null,
    weekly
      ? translate(
          'components.native-chat.account.weekly',
          'Weekly: {{used}}% used, resets in {{reset}}',
          {
            used: Math.round(weekly.usedPercent),
            reset: formatRateLimitWindowChipLabel(weekly, now)
          }
        )
      : null,
    !session && !weekly
      ? translate('components.native-chat.account.noUsage', 'Usage not loaded yet')
      : null
  ].filter((line): line is string => line !== null)
  const strained = Math.max(session?.usedPercent ?? 0, weekly?.usedPercent ?? 0) >= 80
  return (
    // Why: under the box, eating into its bottom padding, so the box itself never changes.
    <div className="-mb-2 mt-1 flex px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-native-chat-account-usage=""
            className={
              strained
                ? 'whitespace-nowrap text-xs tabular-nums text-status-warning'
                : 'whitespace-nowrap text-xs tabular-nums text-chat-foreground-faint'
            }
          >
            {parts.join(' · ')}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4} className="whitespace-pre-line">
          {detail.join('\n')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
