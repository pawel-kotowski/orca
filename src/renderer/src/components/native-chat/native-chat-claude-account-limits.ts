import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { ProviderRateLimits } from '../../../../shared/agent-usage/rate-limits/rate-limit-types'
import type { ProviderAccountsSnapshot } from '@/runtime/provider-accounts/observations/runtime-provider-accounts-client'

// Why one shared clock: every open chat would otherwise ask main for the other accounts' usage.
let lastInactiveFetchAt = Number.NEGATIVE_INFINITY
const INACTIVE_REFRESH_MS = 5 * 60 * 1000

/** A managed account's limits as a paired host last read them. */
export function managedLimits(
  snapshot: Pick<ProviderAccountsSnapshot, 'claude' | 'rateLimits'>,
  accountId: string | null
): ProviderRateLimits | null {
  return accountId === null
    ? null
    : accountId === snapshot.claude.activeAccountId
      ? (snapshot.rateLimits?.claude ?? null)
      : (snapshot.rateLimits?.inactiveClaudeAccounts.find((entry) => entry.accountId === accountId)
          ?.rateLimits ?? null)
}

/** A managed account's limits on this computer, asked for when it is not the active one. */
export function useLocalClaudeAccountLimits(accountId: string | null): ProviderRateLimits | null {
  const isActive = useAppStore(
    (state) => accountId !== null && state.settings?.activeClaudeManagedAccountId === accountId
  )
  const limits = useAppStore((state) =>
    accountId === null
      ? null
      : isActive
        ? state.rateLimits.claude
        : (state.rateLimits.inactiveClaudeAccounts.find((entry) => entry.accountId === accountId)
            ?.rateLimits ?? null)
  )
  const needsFetch = accountId !== null && !isActive
  useEffect(() => {
    if (!needsFetch || window.performance.now() - lastInactiveFetchAt < INACTIVE_REFRESH_MS) {
      return
    }
    lastInactiveFetchAt = window.performance.now()
    void useAppStore.getState().fetchInactiveClaudeAccountUsage()
  }, [needsFetch])
  return limits
}
