import { useEffect, useSyncExternalStore } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { ProviderAccountsSnapshot } from '@/runtime/runtime-provider-accounts-client'

/**
 * A remote workspace's agents run on its host, under that host's Claude login, so the chat's
 * account and limits come from that host (its `accounts.list`, as the status bar reads it for the
 * focused workspace), never from this app's settings. One snapshot per host, shared by its chats.
 */
type Entry = { snapshot: ProviderAccountsSnapshot | null; fetchedAt: number; inFlight: boolean }

const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
// Matches the desktop's own usage poll cadence.
const REFRESH_MS = 5 * 60 * 1000
const TIMEOUT_MS = 30_000

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

async function refresh(environmentId: string): Promise<void> {
  const previous = entries.get(environmentId)
  entries.set(environmentId, {
    snapshot: previous?.snapshot ?? null,
    fetchedAt: previous?.fetchedAt ?? Number.NEGATIVE_INFINITY,
    inFlight: true
  })
  let snapshot = previous?.snapshot ?? null
  try {
    snapshot = await callRuntimeRpc<ProviderAccountsSnapshot>(
      { kind: 'environment', environmentId },
      'accounts.list',
      { refreshUsage: false },
      { timeoutMs: TIMEOUT_MS }
    )
  } catch {
    // An unreachable host keeps its last snapshot; the next chat to mount asks again.
  }
  entries.set(environmentId, { snapshot, fetchedAt: window.performance.now(), inFlight: false })
  notify()
}

/** The remote host's accounts and usage, fetched on first use and refreshed every 5 minutes. */
export function useRemoteProviderAccounts(
  environmentId: string | null
): ProviderAccountsSnapshot | null {
  const snapshot = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => (environmentId ? (entries.get(environmentId)?.snapshot ?? null) : null)
  )
  useEffect(() => {
    if (!environmentId) {
      return
    }
    const entry = entries.get(environmentId)
    if (entry?.inFlight || (entry && window.performance.now() - entry.fetchedAt < REFRESH_MS)) {
      return
    }
    void refresh(environmentId)
  }, [environmentId])
  return snapshot
}
