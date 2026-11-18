import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '@/store'
import type { ActivityThreadCollapseState } from './thread-list/activity-thread-collapse-context'
import {
  parseStringList,
  readViewLayout,
  useViewLayoutValue,
  writeViewLayout
} from './view-layout-memory'

const EMPTY: readonly string[] = []
// Why module-wide: the saved view is applied once per launch, not again when the sidebar remounts.
let sidebarBodyRestored = false

/**
 * The activity view's folded sections (the Inbox among them), saved in settings so they stay as
 * Paweł left them across restarts and new builds (2026-11-16). They lived in the sidebar's memory
 * before, so every restart unfolded them.
 */
export function useActivityCollapsedGroups(): ActivityThreadCollapseState {
  const { value, commit } = useViewLayoutValue('activityCollapsedGroups', parseStringList, EMPTY)
  const latest = useRef(value)
  latest.current = value
  return useMemo(
    () => ({
      collapsedGroupKeys: new Set(value),
      onToggleGroupCollapse: (groupKey: string) => {
        const current = latest.current
        commit(
          current.includes(groupKey)
            ? current.filter((key) => key !== groupKey)
            : [...current, groupKey]
        )
      }
    }),
    [commit, value]
  )
}

/**
 * Which view the sidebar shows (activity or workspaces), saved in settings. Upstream restores the
 * main view at launch but always opened the sidebar on workspaces (Paweł, 2026-11-16: "all my
 * settings should be remembered ... same for workspace view").
 */
export function useRememberedSidebarBody(): void {
  const loaded = useAppStore((state) => state.settings !== null && state.settings !== undefined)
  const sidebarBody = useAppStore((state) => state.sidebarBody ?? 'workspaces')
  useEffect(() => {
    if (!loaded) {
      return
    }
    if (!sidebarBodyRestored) {
      sidebarBodyRestored = true
      const saved = readViewLayout('sidebarBody')
      if ((saved === 'agents' || saved === 'workspaces') && saved !== sidebarBody) {
        useAppStore.getState().setSidebarBody(saved)
        return
      }
    }
    if (readViewLayout('sidebarBody') !== sidebarBody) {
      writeViewLayout('sidebarBody', sidebarBody)
    }
  }, [loaded, sidebarBody])
}
