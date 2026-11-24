import type { AgentSessionRecord } from '../../../shared/agent-session/lifecycle/agent-session-record'
import {
  agentSessionAccountHomePath,
  type AgentSessionAccountHome
} from '../../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import type { ProviderRateLimits } from '../../../shared/agent-usage/rate-limits/rate-limit-types'
import { rateLimitSpentUntil } from '../../../shared/agent-usage/rate-limits/rate-limit-spent-windows'
import { readClaudeFolderSessionLogin } from '../../claude-accounts/session-login/claude-session-login-read'
import type { StructuredAgentSessionHost } from '../../native-chat/agent-session-wire/host/structured-agent-session-host'
import type { RateLimitService } from '../../rate-limits/service/rate-limit-service'

export type IdleCompactionRateLimits = Pick<
  RateLimitService,
  'fetchInactiveClaudeAccountsOnOpen' | 'getState'
>

type Host = Pick<StructuredAgentSessionHost, 'deps' | 'loadedSessionIds' | 'readUsageLimitCut'>

/** The account home a start of the chat's agent would run under now. */
export async function idleCompactionHome(
  host: Pick<StructuredAgentSessionHost, 'deps'>,
  record: AgentSessionRecord
): Promise<AgentSessionAccountHome | null> {
  return (await host.deps.launchAccountHome?.(record)) ?? record.accountHome
}

/** The compaction would only fail, and its failure would hold what other agents send. */
export async function idleCompactionLimitSpent(
  host: Host,
  record: AgentSessionRecord,
  rateLimits: IdleCompactionRateLimits | null
): Promise<boolean> {
  if (record.location.wslDistro !== null) {
    return false
  }
  const home = await idleCompactionHome(host, record)
  const path = agentSessionAccountHomePath(home)
  if (!home || !path) {
    return false
  }
  const polled = await host.deps.usageLimitAutoContinue?.accountUsage?.(record.provider, home)
  const reading =
    polled?.account?.read() ??
    (record.provider === 'claude' ? await unpolledClaudeReading(path, rateLimits) : null)
  const until = reading ? rateLimitSpentUntil(reading) : undefined
  return (
    until === null ||
    (until !== undefined && until > Date.now()) ||
    (await anotherChatIsCut(host, record, path))
  )
}

/** Orca polls the account selected for the host; the workspace's own may be another. */
async function unpolledClaudeReading(
  home: string,
  rateLimits: IdleCompactionRateLimits | null
): Promise<ProviderRateLimits | null> {
  const login = await readClaudeFolderSessionLogin(home)
  if (!login.accountId) {
    return login.limits
  }
  await rateLimits?.fetchInactiveClaudeAccountsOnOpen()
  const accounts = (await rateLimits?.getState())?.inactiveClaudeAccounts
  return accounts?.find(({ accountId }) => accountId === login.accountId)?.rateLimits ?? null
}

async function anotherChatIsCut(
  host: Host,
  record: AgentSessionRecord,
  home: string
): Promise<boolean> {
  for (const id of host.loadedSessionIds()) {
    const other = id === record.sessionId ? null : host.deps.store.getRecord(id)
    const ranOn = other && (other.launchedAccount?.accountHome ?? other.accountHome)
    if (other?.provider === record.provider && agentSessionAccountHomePath(ranOn) === home) {
      const cut = await host.readUsageLimitCut(id)
      if (cut?.resetsAt !== undefined && cut.resetsAt > Date.now()) {
        return true
      }
    }
  }
  return false
}
