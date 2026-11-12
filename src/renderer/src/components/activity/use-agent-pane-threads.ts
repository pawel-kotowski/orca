import { useDeferredValue, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import { useStructuredChatTabNames } from '@/runtime/native-chat/naming/structured-chat-name-observation'
import { buildActivityEvents } from './activity-event-builder'
import { createActivityEventBuildCache } from '@/components/activity/activity-event-build-cache'
import { freshActivityLiveAgentState, isRunningActivityState } from './activity-event-state'
import {
  useAgentPaneThreadsDefaultHostId,
  useAllAgentPaneThreadStoreData,
  type AgentPaneThreadsStoreData,
  type AllAgentPaneThreadsStoreData
} from './use-agent-pane-thread-store-data'
import { buildAgentPaneThreads, createAgentPaneThreadReuseCache } from './activity-thread-builder'
import {
  EMPTY_PAIRED_DEVICE_IDS_BY_ENVIRONMENT,
  getPairedDeviceIdsByEnvironment
} from '../../../../shared/workspace-creator-visibility'
import { useNow } from '@/hooks/use-now'
import { buildActivityInboxGroups, isActivityThreadStandingBy } from './activity-inbox-sections'
import { useActivityAutoStandByHours } from './activity-auto-stand-by'
import {
  activityWorkerPlacement,
  useActivityWorkers,
  type ActivityWorkers
} from './activity-workers'
import { filterThreadsByActivityScope, resolveActivityScopeRepoIds } from './activity-scope-filter'
import {
  createActivityThreadSearchMatcher,
  buildActivityThreadGroups,
  withReadAgentsGroup,
  isActivitySearchQueryTooLarge
} from './activity-thread-grouping'
import type {
  ActivityGroupBy,
  ThreadReadFilter
} from '../../../../shared/agents-view-thread-filters'
import type { ActivityThreadGroup, AgentPaneThread } from './activity-thread-types'

const EMPTY_PANE_KEYS: ReadonlySet<string> = new Set()
const EMPTY_THREADS: AgentPaneThread[] = []
const EMPTY_GROUPS: ActivityThreadGroup[] = []
const EMPTY_ACTIVITY_BUILD: ReturnType<typeof buildActivityEvents> = {
  events: [],
  liveAgentByPaneKey: {},
  paneEntryByPaneKey: {}
}

/** Every Activity thread before any view filter: store data to events and threads. */
export function useAllAgentPaneThreads({ badgeOnly = false }: { badgeOnly?: boolean } = {}): {
  storeData: AllAgentPaneThreadsStoreData
  allThreads: AgentPaneThread[]
} {
  const storeData = useAllAgentPaneThreadStoreData()
  // Why: agentStatusEpoch is a dep (not used in the body) so the memo recomputes when freshness boundaries expire even without new PTY data.
  const agentStatusEpoch = useAppStore((s) => s.agentStatusEpoch)
  const chatNames = useStructuredChatTabNames()

  // Per-hook caches preserve unchanged pane/event/thread identities across status writes, including repeated StrictMode/deferred builds.
  const eventBuildCacheRef = useRef<ReturnType<typeof createActivityEventBuildCache>>(undefined!)
  eventBuildCacheRef.current ??= createActivityEventBuildCache()
  const threadReuseCacheRef = useRef<ReturnType<typeof createAgentPaneThreadReuseCache>>(undefined!)
  threadReuseCacheRef.current ??= createAgentPaneThreadReuseCache()

  const {
    events: allEvents,
    liveAgentByPaneKey,
    paneEntryByPaneKey
  } = useMemo(
    () => {
      const now = Date.now()
      if (
        badgeOnly &&
        Object.keys(storeData.migrationUnsupportedByPtyId).length === 0 &&
        !Object.values(storeData.agentStatusByPaneKey).some((entry) =>
          freshActivityLiveAgentState(entry, now)
        )
      ) {
        eventBuildCacheRef.current.panes.clear()
        eventBuildCacheRef.current.tabs = undefined
        return EMPTY_ACTIVITY_BUILD
      }
      // Global history caps affect live-thread unread and search state.
      return buildActivityEvents(
        {
          chatNames,
          agentStatusByPaneKey: storeData.agentStatusByPaneKey,
          runtimeAgentOrchestrationByPaneKey: storeData.runtimeAgentOrchestrationByPaneKey,
          migrationUnsupportedByPtyId: storeData.migrationUnsupportedByPtyId,
          retainedAgentsByPaneKey: storeData.retainedAgentsByPaneKey,
          tabsByWorktree: storeData.tabsByWorktree,
          ptyIdsByTabId: storeData.ptyIdsByTabId,
          unifiedTabsByWorktree: storeData.activityTabs,
          worktreeMap: storeData.worktreeMap,
          repoMap: storeData.repoMap,
          repos: storeData.repos,
          resolveWorktree: storeData.getKnownWorktreeById,
          acknowledgedAgentsByPaneKey: storeData.acknowledgedAgentsByPaneKey,
          activityClearedAtByPaneKey: storeData.activityClearedAtByPaneKey,
          // Why: Date.now() is read in the memo body (not a dep) so stale-decay recomputes when agentStatusEpoch ticks, not on wall-clock time.
          now
        },
        eventBuildCacheRef.current
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeData, agentStatusEpoch, chatNames, badgeOnly]
  )

  const allThreads = useMemo(
    () =>
      buildAgentPaneThreads(
        {
          events: badgeOnly
            ? allEvents.filter((event) => liveAgentByPaneKey[event.entry.paneKey])
            : allEvents,
          liveAgentByPaneKey,
          paneEntryByPaneKey,
          generatedTitlesEnabled: storeData.generatedTitlesEnabled
        },
        threadReuseCacheRef.current
      ),
    [allEvents, liveAgentByPaneKey, paneEntryByPaneKey, storeData.generatedTitlesEnabled, badgeOnly]
  )

  return { storeData, allThreads }
}

/** Shared Activity/sidebar pipeline: store data to events, threads, filters and groups. */
export function useAgentPaneThreads(args: {
  query: string
  readFilter: ThreadReadFilter
  groupBy: ActivityGroupBy
  selectedPaneKey: string | null
  showChildAgents?: boolean
  /** Prepare only live badge rows, omitting list groups and bulk-action sets. */
  badgeOnly?: boolean
}): {
  storeData: AgentPaneThreadsStoreData
  allThreads: AgentPaneThread[]
  selectedPaneKeyIsLive: boolean
  effectiveSelectedPaneKey: string | null
  /** Every active view filter applies here; destructive Clear completed must not touch hidden rows. */
  visibleThreads: AgentPaneThread[]
  /** Badge-coherent threads after child classification; ignore transient search/scope/read filters so Mark all read can clear the badge. */
  markAllReadThreads: AgentPaneThread[]
  visibleThreadGroups: ActivityThreadGroup[]
  workers: ActivityWorkers
} {
  const {
    query,
    readFilter,
    groupBy,
    selectedPaneKey,
    showChildAgents = false,
    badgeOnly = false
  } = args
  const agentsVisibleHostIds = useAppStore((s) => s.agentsVisibleHostIds)
  const agentsFilterRepoIds = useAppStore((s) => s.agentsFilterRepoIds)
  const hideWorkspacesFromOtherDevices = useAppStore((s) => s.agentsHideWorkspacesFromOtherDevices)
  const hideAutomationGeneratedWorkspaces = useAppStore(
    (s) => s.agentsHideAutomationGeneratedWorkspaces
  )
  const hideCliCreatedWorkspaces = useAppStore((s) => s.agentsHideCliCreatedWorkspaces)
  // Why gated selectors: runtime status churns, and only the other-device filter reads it.
  const runtimeEnvironments = useAppStore((s) =>
    s.agentsHideWorkspacesFromOtherDevices ? s.runtimeEnvironments : null
  )
  const runtimeStatusByEnvironmentId = useAppStore((s) =>
    s.agentsHideWorkspacesFromOtherDevices ? s.runtimeStatusByEnvironmentId : null
  )
  const pairedDeviceIdsByEnvironment = useMemo(
    () =>
      runtimeEnvironments && runtimeStatusByEnvironmentId
        ? getPairedDeviceIdsByEnvironment(runtimeEnvironments, runtimeStatusByEnvironmentId)
        : EMPTY_PAIRED_DEVICE_IDS_BY_ENVIRONMENT,
    [runtimeEnvironments, runtimeStatusByEnvironmentId]
  )
  const { storeData: unscopedStoreData, allThreads } = useAllAgentPaneThreads({ badgeOnly })
  const defaultHostId = useAgentPaneThreadsDefaultHostId()
  const storeData = useMemo(
    () => ({ ...unscopedStoreData, defaultHostId }),
    [unscopedStoreData, defaultHostId]
  )

  const selectedPaneKeyIsLive =
    selectedPaneKey === null || allThreads.some((thread) => thread.paneKey === selectedPaneKey)
  const effectiveSelectedPaneKey = selectedPaneKeyIsLive ? selectedPaneKey : null

  // Why scope runs before the per-view filters: host/project/origin scope must stay separate
  // from unread/search narrowing.
  const { threads: scopeVisibleThreads } = useMemo(
    () =>
      filterThreadsByActivityScope({
        threads: allThreads,
        scope: {
          visibleHostIds: agentsVisibleHostIds,
          filterRepoIds: resolveActivityScopeRepoIds(agentsFilterRepoIds, storeData.repoMap),
          defaultHostId: storeData.defaultHostId,
          hideWorkspacesFromOtherDevices,
          pairedDeviceIdsByEnvironment,
          hideAutomationGeneratedWorkspaces,
          hideCliCreatedWorkspaces
        },
        exemptPaneKey: effectiveSelectedPaneKey
      }),
    [
      allThreads,
      agentsVisibleHostIds,
      agentsFilterRepoIds,
      storeData.repoMap,
      storeData.defaultHostId,
      hideWorkspacesFromOtherDevices,
      pairedDeviceIdsByEnvironment,
      hideAutomationGeneratedWorkspaces,
      hideCliCreatedWorkspaces,
      effectiveSelectedPaneKey
    ]
  )

  // Classify workers over all threads so scoped-out coordinators do not orphan them.
  const workers = useActivityWorkers(allThreads)

  // Defer list filtering while typed input updates at full priority.
  const deferredQuery = useDeferredValue(query)
  // Panes the last build listed under Standing by. Why: a clicked card stays where it was; one
  // clicked in Standing by must not jump to its status section, nor a just-read one jump down.
  const lastReadOnlyKeysRef = useRef<ReadonlySet<string>>(EMPTY_PANE_KEYS)
  const autoStandByHours = useActivityAutoStandByHours()
  // Why a minute clock only with the timer on: it only decides when a seen card stands by.
  const now = useNow(60_000, autoStandByHours !== null)
  const acknowledgedAgentsByPaneKey = storeData.acknowledgedAgentsByPaneKey
  const { visible: visibleThreads, readOnly: readOnlyThreads } = useMemo(() => {
    const normalizedQuery = isActivitySearchQueryTooLarge(deferredQuery)
      ? null
      : deferredQuery.trim().toLowerCase()
    let matchesSearchQuery: ReturnType<typeof createActivityThreadSearchMatcher> | undefined
    const readOnly: AgentPaneThread[] = []
    const visible = scopeVisibleThreads.filter((thread) => {
      // Why: keep the just-selected thread visible after auto-mark-read flips it to read, else unread-only mode makes the clicked row vanish from the list.
      // Why the open card's exemption covers only the unread filter: an X or the timer on the open
      // card must move it at once, or the click looks dead.
      // Live agents stay listed after marking read too; migration blocks are unavailable.
      const placement = activityWorkerPlacement(thread, workers, showChildAgents)
      const hiddenAsRead =
        placement === 'standingBy' ||
        isActivityThreadStandingBy(thread, acknowledgedAgentsByPaneKey, autoStandByHours, now) ||
        (readFilter === 'unread' &&
          !thread.unread &&
          (!isRunningActivityState(thread.currentAgentState) ||
            thread.migrationUnsupportedPtyId !== undefined) &&
          (thread.paneKey !== effectiveSelectedPaneKey ||
            lastReadOnlyKeysRef.current.has(thread.paneKey)))
      // Why: a worker lives folded inside its coordinator's card unless workers are listed too.
      if (placement === 'nested') {
        return false
      }
      if (normalizedQuery === null) {
        return false
      }
      matchesSearchQuery ??= createActivityThreadSearchMatcher(normalizedQuery)
      if (!matchesSearchQuery(thread)) {
        return false
      }
      if (hiddenAsRead) {
        readOnly.push(thread)
        return false
      }
      return true
    })
    lastReadOnlyKeysRef.current = new Set(readOnly.map((thread) => thread.paneKey))
    return { visible, readOnly }
  }, [
    scopeVisibleThreads,
    readFilter,
    deferredQuery,
    effectiveSelectedPaneKey,
    showChildAgents,
    workers,
    acknowledgedAgentsByPaneKey,
    autoStandByHours,
    now
  ])

  // Why every thread: workers never light the badge, so marking them read too costs nothing.
  const markAllReadThreads = badgeOnly ? EMPTY_THREADS : allThreads

  const visibleThreadGroups = useMemo(
    () =>
      badgeOnly
        ? EMPTY_GROUPS
        : withReadAgentsGroup(
            groupBy === 'status'
              ? buildActivityInboxGroups(visibleThreads)
              : buildActivityThreadGroups(visibleThreads, groupBy),
            readOnlyThreads
          ),
    [visibleThreads, readOnlyThreads, groupBy, badgeOnly]
  )

  return {
    storeData,
    allThreads,
    selectedPaneKeyIsLive,
    effectiveSelectedPaneKey,
    visibleThreads,
    markAllReadThreads,
    visibleThreadGroups,
    workers
  }
}
