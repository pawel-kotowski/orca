import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useAppStore } from '@/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useResetCountdownClock } from '@/hooks/useResetCountdownClock'
import { translate } from '@/i18n/i18n'
import type { ClaudeManagedAccount } from '../../../../shared/managed-account-types'
import type { ProviderRateLimits, RateLimitWindow } from '../../../../shared/rate-limit-types'
import { formatRateLimitWindowChipLabel } from '../../../../shared/rate-limit-window-label'
import { clampUsedPercent } from '../../../../shared/usage-percentage-display'
import { NativeChatMeter } from './native-chat-meter'
import { NativeChatAccountSwitch } from './native-chat-account-switch'
import { workspaceClaudeAccountId } from '../../../../shared/claude-workspace-account'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/rpc/targets/runtime-client-target'
import type { ProviderAccountsSnapshot } from '@/runtime/provider-accounts/observations/runtime-provider-accounts-client'
import { useRemoteProviderAccounts } from './native-chat-remote-claude-usage'

/** Which chat the message box belongs to, so its controls can show that chat's Claude account. */
export type NativeChatAccountScope = {
  agent: string
  transcriptPath: string | null
  terminalTabId: string
}

const NativeChatAccountScopeContext = createContext<NativeChatAccountScope | null>(null)

/** The chat the message box belongs to, or null outside a terminal-backed chat. */
export function useNativeChatAccountScope(): NativeChatAccountScope | null {
  return useContext(NativeChatAccountScopeContext)
}

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

export function worktreeIdForTab(
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

/** What the chat line shows: the subscription's short name, its email when known, its limits. */
type ChatClaudeUsage = {
  /** The subscription owner's short name; null while the host has not reported its login. */
  name: string | null
  email: string | null
  limits: ProviderRateLimits | null
  /** The managed account and workspace a switch acts on; null for another machine's chat. */
  accountId?: string | null
  worktreeId?: string | null
}

/**
 * A remote host's chat: the managed account its transcript lives under, else that host's active
 * account, else the host's own system login. Its email is known only when the host reports it.
 */
export function resolveRemoteChatClaudeUsage(
  snapshot: ProviderAccountsSnapshot,
  transcriptPath: string | null
): ChatClaudeUsage {
  const { claude, rateLimits } = snapshot
  const fromTranscript = accountIdFromTranscriptPath(transcriptPath)
  const accountId =
    fromTranscript ??
    // A transcript outside any managed home ran on the system login.
    (transcriptPath ? null : claude.activeAccountId)
  const account = claude.accounts.find((entry) => entry.id === accountId) ?? null
  if (account) {
    const limits =
      account.id === claude.activeAccountId
        ? (rateLimits?.claude ?? null)
        : (rateLimits?.inactiveClaudeAccounts.find((entry) => entry.accountId === account.id)
            ?.rateLimits ?? null)
    return { name: accountShortName(account.email), email: account.email, limits }
  }
  const email = claude.systemDefaultEmail ?? claude.systemLoginEmail ?? null
  return {
    // Why never the host's name: the line names the subscription's owner; the machine has its
    // own place on the line (native-chat-place-line). An older host does not report its login.
    name: email ? accountShortName(email) : null,
    email,
    limits: claude.activeAccountId === null ? (rateLimits?.claude ?? null) : null
  }
}

function useChatClaudeUsage(scope: NativeChatAccountScope): ChatClaudeUsage | null {
  const worktreeId = useAppStore((state) =>
    worktreeIdForTab(state.tabsByWorktree, scope.terminalTabId)
  )
  // 'local', a remote host's environment id, or '' for a host this app cannot ask (direct SSH).
  const owner = useAppStore((state) => {
    const target = runtimeRpcTargetForAuthorityKey(getExecutionHostIdForWorktree(state, worktreeId))
    return target === null ? '' : target.kind === 'environment' ? target.environmentId : 'local'
  })
  const remoteId = owner !== 'local' && owner !== '' ? owner : null
  const snapshot = useRemoteProviderAccounts(remoteId)
  const account = useAppStore((state) =>
    owner === 'local'
      ? resolveChatClaudeAccount({
          transcriptPath: scope.transcriptPath,
          worktreeId,
          accounts: state.settings?.claudeManagedAccounts ?? [],
          accountByWorktreeId: state.settings?.claudeAccountByWorktreeId,
          activeAccountId: state.settings?.activeClaudeManagedAccountId ?? null
        })
      : null
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
  if (remoteId) {
    return snapshot ? resolveRemoteChatClaudeUsage(snapshot, scope.transcriptPath) : null
  }
  return account
    ? {
        name: accountShortName(account.email),
        email: account.email,
        limits,
        accountId: account.id,
        worktreeId
      }
    : null
}

/**
 * The Claude subscription this chat runs on and how much of its session (5 h) and weekly limits
 * are used, as a short bar each with its reset time, on a quiet line under the message box.
 */
const NO_SCOPE: NativeChatAccountScope = { agent: '', transcriptPath: null, terminalTabId: '' }

/** The chat's subscription owner (what its footer names), for opening its links in their Chrome. */
export function useNativeChatClaudeIdentity(): {
  email: string | null
  name: string | null
} | null {
  const scope = useContext(NativeChatAccountScopeContext)
  const usage = useChatClaudeUsage(scope ?? NO_SCOPE)
  if (!scope || scope.agent !== 'claude' || !usage || (!usage.email && !usage.name)) {
    return null
  }
  return { email: usage.email, name: usage.name }
}

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
  const { name } = usage
  const sessionLabel = translate('components.native-chat.account.sessionShort', '5h')
  const weekLabel = translate('components.native-chat.account.week', 'wk')
  const detail = [
    usage.email
      ? translate('components.native-chat.account.detail', 'Claude account {{email}}', {
          email: usage.email
        })
      : translate(
          'components.native-chat.account.hostLoginUnknown',
          "This chat's host has not reported its Claude login yet"
        ),
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
  return (
    <span
      data-native-chat-account-usage=""
      className="flex items-center gap-2.5 whitespace-nowrap text-2xs tabular-nums text-chat-foreground-faint"
    >
      {name ? (
        // Why: whose subscription this is reads at a glance, in the theme's blue; a click moves
        // the chat to another one (native-chat-account-switch). Outside the tooltip, which would
        // otherwise cover its open menu.
        <NativeChatAccountSwitch
          name={name}
          currentAccountId={usage.accountId ?? null}
          worktreeId={usage.worktreeId ?? null}
          terminalTabId={scope.terminalTabId}
        />
      ) : null}
      {session || weekly ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-2.5">
              {session ? <UsageBar label={sessionLabel} window={session} now={now} /> : null}
              {weekly ? <UsageBar label={weekLabel} window={weekly} now={now} /> : null}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4} className="whitespace-pre-line">
            {detail.join('\n')}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  )
}

/** One limit as a short bar: how full it is (the status bar's colours), then when it resets. */
function UsageBar({
  label,
  window,
  now
}: {
  label: string
  window: RateLimitWindow
  now: number
}): React.JSX.Element {
  const used = clampUsedPercent(window.usedPercent)
  return (
    <span className="flex items-center gap-1">
      <span>{label}</span>
      <NativeChatMeter label={label} usedPercent={used} />
      <span className="text-chat-foreground">{formatRateLimitWindowChipLabel(window, now)}</span>
    </span>
  )
}
