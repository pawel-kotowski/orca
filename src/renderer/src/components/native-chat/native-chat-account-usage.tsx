import { useContext } from 'react'
import { useAppStore } from '@/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useResetCountdownClock } from '@/components/status-bar/usage/useResetCountdownClock'
import { translate } from '@/i18n/i18n'
import type { ClaudeManagedAccount } from '../../../../shared/agent-accounts/managed-account-types'
import type {
  ProviderRateLimits,
  RateLimitWindow
} from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import { formatRateLimitWindowChipLabel } from '../../../../shared/agent-usage/rate-limits/rate-limit-window-label'
import { clampUsedPercent } from '../../../../shared/agent-usage/display/usage-percentage-display'
import { NativeChatMeter } from './native-chat-meter'
import {
  NativeChatAccountSwitch,
  NativeChatRemoteAccountSwitch,
  NativeChatStructuredAccountSwitch
} from './native-chat-account-switch'
import { workspaceClaudeAccountId } from '../../../../shared/claude-workspace-account'
import { claudeAccountOrgName } from '../../../../shared/agent-accounts/claude-account-org-name'
import { getExecutionHostIdForWorktree } from '@/lib/workspace/ownership/worktree-runtime-owner'
import { runtimeRpcTargetForAuthorityKey } from '@/runtime/rpc/targets/runtime-client-target'
import type { ProviderAccountsSnapshot } from '@/runtime/provider-accounts/observations/runtime-provider-accounts-client'
import { managedLimits, useLocalClaudeAccountLimits } from './native-chat-claude-account-limits'
import { useRemoteProviderAccounts } from './native-chat-remote-claude-usage'
import {
  useClaudeSessionLogin,
  type ClaudeSessionLoginState
} from './native-chat-claude-session-login'
import {
  NativeChatAccountScopeContext,
  type NativeChatAccountScope,
  type NativeChatStructuredAccountScope,
  type NativeChatTerminalAccountScope
} from './native-chat-account-scope'
import { useStructuredClaudeAccount } from './native-chat-structured-claude-account'
import {
  structuredClaudeUsage,
  type StructuredClaudeUsage
} from './native-chat-structured-claude-usage'
import { claudeConfigDirFromTranscriptPath } from '../../../../shared/agent-accounts/claude/claude-session-login'

export {
  NativeChatAccountScopeProvider,
  NativeChatStructuredAccountScopeProvider,
  useNativeChatAccountScope,
  type NativeChatAccountScope
} from './native-chat-account-scope'

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

/** A short name for a subscription: its organisation's domain ("moshealth"), or "personal". */
export function accountShortName(email: string): string {
  return (
    claudeAccountOrgName(email) ?? translate('components.native-chat.account.personal', 'personal')
  )
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
  // Why: a session in any other Claude folder (the system home, or one a box's limit-move or a
  // hand restart pointed CLAUDE_CONFIG_DIR at) runs on that folder's own login, which the chat
  // reads from the folder (sessionLoginUsage), never from a saved account it does not run on.
  if (claudeConfigDirFromTranscriptPath(input.transcriptPath)) {
    return null
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

/** What the chat line shows: the subscription's short name, its email when known, its limits. */
export type ChatClaudeUsage = {
  /** The subscription owner's short name; null while the host has not reported its login. */
  name: string | null
  email: string | null
  limits: ProviderRateLimits | null
  /** The managed account and workspace a switch acts on; null for another machine's chat. */
  accountId?: string | null
  worktreeId?: string | null
  /** The paired machine whose own logins a switch offers; null for this machine's chat. */
  environmentId?: string | null
  /** A structured chat's account, as its host reads it. */
  structured?: StructuredClaudeUsage
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
    const limits = managedLimits(snapshot, account.id)
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

/** Whether a transcript lives in a Claude folder Orca does not manage, so its folder names it. */
export function isUnmanagedClaudeFolder(transcriptPath: string | null): boolean {
  return (
    claudeConfigDirFromTranscriptPath(transcriptPath) !== null &&
    accountIdFromTranscriptPath(transcriptPath) === null
  )
}

/**
 * A chat in an unmanaged folder shows that folder's own login and limits, as its host read them.
 * Undefined means the host could not say (an older build): the caller falls back to what it knew.
 */
export function sessionLoginUsage(
  state: ClaudeSessionLoginState | null
): ChatClaudeUsage | null | undefined {
  if (!state || state.status === 'failed') {
    return undefined
  }
  if (state.status === 'loading') {
    // Why nothing: the folder's previous guess (the host's system login) is what was wrong.
    return null
  }
  const email = state.login?.email ?? null
  return email
    ? { name: accountShortName(email), email, limits: state.login?.limits ?? null, accountId: null }
    : null
}

function useStructuredChatClaudeUsage(
  chat: NativeChatStructuredAccountScope | null
): ChatClaudeUsage | null {
  const account = useStructuredClaudeAccount(chat)
  const usage = structuredClaudeUsage(account)
  const environmentId = chat?.target.kind === 'environment' ? chat.target.environmentId : null
  // A chat whose session does not exist yet starts on its workspace's account, as a terminal's does.
  const worktreeId = chat?.worktreeId ?? null
  const upcoming = useAppStore((state) => {
    if (account?.status !== 'unsupported' || environmentId !== null || !state.settings) {
      return null
    }
    const id =
      workspaceClaudeAccountId(state.settings, worktreeId) ??
      state.settings.activeClaudeManagedAccountId
    return state.settings.claudeManagedAccounts.find((entry) => entry.id === id) ?? null
  })
  const accountId = usage?.shown.accountId ?? upcoming?.id ?? null
  const snapshot = useRemoteProviderAccounts(usage ? environmentId : null)
  const local = useLocalClaudeAccountLimits(environmentId === null ? accountId : null)
  if (!usage) {
    return upcoming
      ? {
          name: accountShortName(upcoming.email),
          email: upcoming.email,
          limits: local,
          accountId: upcoming.id,
          worktreeId
        }
      : null
  }
  const { email, limits } = usage.shown
  return {
    name: email ? accountShortName(email) : null,
    email,
    limits:
      limits ??
      (environmentId === null ? local : snapshot ? managedLimits(snapshot, accountId) : null),
    structured: usage
  }
}

function useChatClaudeUsage(scope: NativeChatAccountScope): ChatClaudeUsage | null {
  const terminal = useTerminalChatClaudeUsage(scope.kind === 'terminal' ? scope : NO_SCOPE)
  const structured = useStructuredChatClaudeUsage(
    scope.kind === 'structured' && scope.agent === 'claude' ? scope : null
  )
  return scope.kind === 'structured' ? structured : terminal
}

function useTerminalChatClaudeUsage(scope: NativeChatTerminalAccountScope): ChatClaudeUsage | null {
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
  const unmanaged = scope.agent === 'claude' && isUnmanagedClaudeFolder(scope.transcriptPath)
  const sessionLogin = useClaudeSessionLogin(
    unmanaged ? scope.transcriptPath : null,
    owner === '' ? null : owner
  )
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
  const limits = useLocalClaudeAccountLimits(account?.id ?? null)
  const fromFolder = unmanaged ? sessionLoginUsage(sessionLogin) : undefined
  if (fromFolder !== undefined) {
    return (
      fromFolder &&
      (remoteId ? { ...fromFolder, environmentId: remoteId } : { ...fromFolder, worktreeId })
    )
  }
  if (remoteId) {
    return snapshot
      ? {
          ...resolveRemoteChatClaudeUsage(snapshot, scope.transcriptPath),
          environmentId: remoteId
        }
      : null
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
const NO_SCOPE: NativeChatTerminalAccountScope = {
  kind: 'terminal',
  agent: '',
  transcriptPath: null,
  terminalTabId: ''
}

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
        scope.kind === 'structured' ? (
          usage.structured ? (
            <NativeChatStructuredAccountSwitch name={name} chat={scope} usage={usage.structured} />
          ) : (
            // Not started yet: the pick is the workspace's account its first turn starts on.
            <NativeChatAccountSwitch
              name={name}
              currentAccountId={usage.accountId ?? null}
              worktreeId={usage.worktreeId ?? null}
              terminalTabId={scope.tabId}
            />
          )
        ) : usage.environmentId ? (
          <NativeChatRemoteAccountSwitch
            name={name}
            environmentId={usage.environmentId}
            terminalTabId={scope.terminalTabId}
            transcriptPath={scope.transcriptPath}
          />
        ) : (
          <NativeChatAccountSwitch
            name={name}
            currentAccountId={usage.accountId ?? null}
            worktreeId={usage.worktreeId ?? null}
            terminalTabId={scope.terminalTabId}
          />
        )
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
