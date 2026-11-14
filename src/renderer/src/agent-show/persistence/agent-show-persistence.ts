import type { AgentShowContext } from '../../../../shared/agent-show/agent-show-contract'
import { useAppStore } from '@/store/index'
import {
  codeMarkOwnerKey,
  restoreOwnerCodeMarks,
  snapshotOwnerCodeMarks,
  subscribeCodeMarks
} from '../code/code-mark-store'
import { restoreCodeStage, snapshotCodeStage } from '../code/code-stage-tabs'
import { getTreeMarkSet, setTreeMarkSet, subscribeTreeMarks } from '../tree/tree-marks-store'
import { uiRequestsOf, type ShownUiRequest } from '../ui/ui-mark-requests'
import { showUi } from '../ui/show-ui'
import { watchedShowOwners, watchShowOwner } from '../agent-show-owner-lifecycle'
import { onAgentShowChange } from './agent-show-change-signal'
import { restoreTour, tourOf } from '../tour/tour-player'
import { ensureTourStrips } from '../tour/TourStripHost'
import {
  isEmptyShow,
  parseShows,
  restorableShows,
  serializeShows,
  type OwnerShowSnapshot
} from './agent-show-snapshot'

// Why localStorage: it survives a window reload and an app restart in this profile, and keeps a
// teaching overlay out of the workspace session's host-owned, migrated records.
const STORAGE_KEY = 'orca.agentShow.stages.v1'
const SAVE_DELAY_MS = 400
const PAGE_RETRY_MS = 1000
const PAGE_RETRIES = 20

function tourSnapshotOf(context: AgentShowContext): OwnerShowSnapshot['tour'] {
  const tour = tourOf(context)
  return tour ? { title: tour.title, file: tour.file, index: tour.index, steps: tour.steps } : null
}

function snapshotOwner(context: AgentShowContext): OwnerShowSnapshot | null {
  if (!context.ownerTabId) {
    return null
  }
  const tree = getTreeMarkSet(context.ownerTabId)
  return {
    worktreeId: context.worktreeId,
    worktreePath: context.worktreePath,
    ownerTabId: context.ownerTabId,
    code: snapshotOwnerCodeMarks(codeMarkOwnerKey(context)),
    stage: snapshotCodeStage(context),
    tree: tree ? { ...tree, entries: [...tree.entries] } : null,
    ui: uiRequestsOf(context),
    tour: tourSnapshotOf(context)
  }
}

function save(): void {
  const owners = watchedShowOwners().flatMap((context) => {
    const snapshot = snapshotOwner(context)
    return snapshot && !isEmptyShow(snapshot) ? [snapshot] : []
  })
  try {
    if (owners.length === 0) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, serializeShows(owners))
    }
  } catch {
    // Why: storage can be full or blocked; marks then just do not outlive the window.
  }
}

/** Page marks are drawn again once the page has loaded; a page that never comes back is skipped. */
async function replayPageMarks(context: AgentShowContext, shown: ShownUiRequest[]): Promise<void> {
  for (const { pageId, request } of shown) {
    for (let attempt = 0; attempt < PAGE_RETRIES; attempt += 1) {
      const result = await showUi({ ...request, pageId }, context)
      if (result.ok) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, PAGE_RETRY_MS))
    }
  }
}

function restore(clearEverything: (context: AgentShowContext) => unknown): void {
  let stored: OwnerShowSnapshot[] = []
  try {
    stored = parseShows(localStorage.getItem(STORAGE_KEY))
  } catch {
    return
  }
  for (const owner of restorableShows(stored, useAppStore.getState().unifiedTabsByWorktree)) {
    const context: AgentShowContext = {
      worktreeId: owner.worktreeId,
      worktreePath: owner.worktreePath,
      ownerTabId: owner.ownerTabId,
      // Why: a restored stage must not pull the user anywhere.
      focus: false
    }
    restoreOwnerCodeMarks(codeMarkOwnerKey(context), owner.code)
    restoreCodeStage(context, owner.stage)
    if (owner.tree) {
      setTreeMarkSet(owner.ownerTabId, owner.tree)
    }
    watchShowOwner(context, clearEverything)
    void replayPageMarks(context, owner.ui)
    if (owner.tour && owner.tour.steps.length > 0) {
      ensureTourStrips()
      restoreTour(context, owner.tour)
    }
  }
}

const sessionLoaded = (): boolean => {
  const state = useAppStore.getState()
  return state.workspaceSessionReady && state.hydrationSucceeded
}

/**
 * Brings each agent's stage back after a reload or restart while its tab is open, then keeps
 * the stored copy current. Owners whose tab is gone are dropped on the first save.
 */
export function startAgentShowPersistence(
  clearEverything: (context: AgentShowContext) => unknown
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  const schedule = (): void => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      save()
    }, SAVE_DELAY_MS)
  }
  const subscriptions: (() => void)[] = []
  const begin = (): void => {
    restore(clearEverything)
    subscriptions.push(subscribeCodeMarks(schedule), subscribeTreeMarks(schedule))
    subscriptions.push(onAgentShowChange(schedule))
    schedule()
  }
  if (sessionLoaded()) {
    begin()
  } else {
    const unsubscribe = useAppStore.subscribe(() => {
      if (sessionLoaded()) {
        unsubscribe()
        begin()
      }
    })
    subscriptions.push(unsubscribe)
  }
  return () => {
    if (timer) {
      clearTimeout(timer)
    }
    subscriptions.forEach((unsubscribe) => unsubscribe())
  }
}
