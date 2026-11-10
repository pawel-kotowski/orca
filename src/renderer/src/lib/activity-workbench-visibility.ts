import { useEffect, useSyncExternalStore } from 'react'
import { useAppStore } from '@/store'
import { hideFloatingWorkspacePanel } from '@/lib/floating-workspace-panel-reveal'
import { selectFloatingWorkspacePanelVisible } from '@/store/floating-workspace-panel-selector'

// Why: in the activity view the main area can step aside, like the floating workspace hides:
// the tabs stay mounted and their agents keep running; only the view is hidden.
let hidden = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setActivityHidesWorkbench(next: boolean): void {
  if (hidden === next) {
    return
  }
  hidden = next
  // Why: a card keeps focus after the click that opened its workspace, and the Escape that hides
  // it would show that focus as a frame; with nothing open no card may look chosen.
  if (next && typeof HTMLElement !== 'undefined') {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.closest('[data-activity-thread-pane-key]')) {
      focused.blur()
    }
  }
  for (const listener of listeners) {
    listener()
  }
}

/** A workspace created or launched from the activity view is meant to be seen: its tabs show. */
export function showActivityTabsForLaunch(launches: unknown): void {
  if (launches) {
    setActivityHidesWorkbench(false)
  }
}

// Why a flag of its own: in the Projects view a click on the open workspace's card steps its tabs
// aside the same way (Paweł, 2026-11-09: "when i click on already selected ws it should close
// just like in activity view"); opening any workspace or tab brings them back.
let projectsHidden = false

export function setProjectsHidesWorkbench(next: boolean): void {
  if (projectsHidden === next) {
    return
  }
  projectsHidden = next
  for (const listener of listeners) {
    listener()
  }
}

export function projectsHidesWorkbench(): boolean {
  return projectsHidden
}

// Why guarded: tests that mock `@/store` as a bare selector function import this module too.
useAppStore.subscribe?.((state, previous) => {
  if (
    state.activeWorktreeId !== previous.activeWorktreeId ||
    state.activeTabId !== previous.activeTabId
  ) {
    setProjectsHidesWorkbench(false)
  }
})

/** Whether the activity view, or the Projects view, has the main area's tabs hidden right now. */
export function useActivityHidesWorkbench(): boolean {
  const agentsBody = useAppStore((state) => state.sidebarBody === 'agents')
  const activityHidden = useSyncExternalStore(subscribe, () => hidden)
  const projectsHide = useSyncExternalStore(subscribe, () => projectsHidden)
  return agentsBody ? activityHidden : projectsHide
}

/**
 * The activity button: from the workspace view it opens the activity view with the tabs hidden;
 * in the activity view it returns straight to the workspace view, whether or not a card brought
 * its tabs back (Escape is what hides them).
 */
export function toggleActivityView(): void {
  const state = useAppStore.getState()
  if (state.sidebarBody !== 'agents') {
    state.setSidebarBody('agents')
    setActivityHidesWorkbench(true)
    return
  }
  setActivityHidesWorkbench(false)
  state.setSidebarBody('workspaces')
}

/** Whether the activity view has the tabs hidden (outside React). */
export function activityHidesWorkbench(): boolean {
  return hidden && useAppStore.getState().sidebarBody === 'agents'
}

// Escape belongs to what has focus when it means something there: a terminal (the agent's own
// interrupt) or a field. A chat is handled before it sees the key (see the capture listener).
function focusKeepsEscape(target: Element | null): boolean {
  if (!target) {
    return false
  }
  if (target.closest('.xterm, [data-native-chat-root]')) {
    return true
  }
  return target.closest('input, textarea, select, [contenteditable="true"]') !== null
}

// Why: the floating workspace is the activity view's other way to show an agent; Escape in its chat
// closes the panel, not the tabs behind it (Paweł, 2026-11-10: Escape there stopped the agent).
function inFloatingPanel(target: Element | null): boolean {
  return target?.closest('[data-floating-terminal-panel]') != null
}

function hideWorkspaceOf(target: Element | null): void {
  if (inFloatingPanel(target)) {
    hideFloatingWorkspacePanel(useAppStore.getState())
    return
  }
  setActivityHidesWorkbench(true)
}

// A chat whose agent works would stop on Escape; in the activity view the person is asked first.
let pendingInterrupt: Element | null = null
let passingEscape = false
const promptListeners = new Set<() => void>()

// Why: the Escape that closes the prompt must not also hide the tabs behind it.
let promptClosedAt = Number.NEGATIVE_INFINITY

function setPendingInterrupt(next: Element | null): void {
  if (pendingInterrupt !== null && next === null) {
    promptClosedAt = window.performance.now()
  }
  pendingInterrupt = next
  for (const listener of promptListeners) {
    listener()
  }
}

/** The open "agent is working" prompt, and its three answers. */
export function useActivityInterruptPrompt(): {
  open: boolean
  hide: () => void
  stop: () => void
  cancel: () => void
} {
  const open = useSyncExternalStore(
    (listener) => {
      promptListeners.add(listener)
      return () => promptListeners.delete(listener)
    },
    () => pendingInterrupt !== null
  )
  return {
    open,
    hide: () => {
      const target = pendingInterrupt
      setPendingInterrupt(null)
      hideWorkspaceOf(target)
    },
    stop: () => {
      const target = pendingInterrupt
      setPendingInterrupt(null)
      if (target instanceof HTMLElement) {
        target.focus()
        // Why: hand the chat its Escape back, so it stops the agent its own way.
        passingEscape = true
        try {
          target.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: 'Escape',
              code: 'Escape',
              bubbles: true,
              cancelable: true
            })
          )
        } finally {
          passingEscape = false
        }
      }
    },
    cancel: () => {
      const target = pendingInterrupt
      setPendingInterrupt(null)
      if (target instanceof HTMLElement) {
        target.focus()
      }
    }
  }
}

// Escape in a chat is the chat's unless the activity view shows tabs; an open picker or hover chat
// spends it first.
function chatEscapeIsSpokenFor(target: Element): boolean {
  return (
    target.closest('[aria-expanded="true"]') !== null ||
    document.querySelector('[data-activity-thread-chat-preview]:not([data-closing])') !== null
  )
}

/**
 * Escape in the activity view hides the tabs a card brought back. From a chat it is taken before
 * the chat sees it (the chat's box would send an interrupt even when idle): an idle chat's tabs
 * hide, a working one asks first (useActivityInterruptPrompt). Elsewhere it hides the tabs when
 * nothing else used it and focus is not in a terminal or a field.
 */
export function useActivityEscapeHidesWorkbench(): void {
  useEffect(() => {
    const showsTabs = (): boolean => useAppStore.getState().sidebarBody === 'agents' && !hidden
    // A floating chat shows on its own panel, whether or not the tabs behind it are hidden.
    const showsChatOf = (target: Element): boolean => {
      const state = useAppStore.getState()
      if (!inFloatingPanel(target)) {
        return showsTabs()
      }
      return state.sidebarBody === 'agents' && selectFloatingWorkspacePanelVisible(state)
    }
    const onChatKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || passingEscape) {
        return
      }
      const target = event.target instanceof Element ? event.target : null
      const chat = target?.closest('[data-native-chat-root]')
      if (!target || !chat || !showsChatOf(target) || chatEscapeIsSpokenFor(target)) {
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (chat.getAttribute('data-native-chat-working') === 'true') {
        setPendingInterrupt(target)
        return
      }
      hideWorkspaceOf(target)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.isComposing || passingEscape) {
        return
      }
      // Why: the activity list itself uses Escape (it marks the key handled), yet on a card it must
      // hide the workspace that card opened; elsewhere a handled Escape is left alone.
      const onCard =
        event.target instanceof Element &&
        event.target.closest('[data-activity-thread-pane-key]') !== null
      if (event.defaultPrevented && !onCard) {
        return
      }
      if (pendingInterrupt !== null || window.performance.now() - promptClosedAt < 250) {
        return
      }
      if (focusKeepsEscape(event.target instanceof Element ? event.target : null)) {
        return
      }
      if (showsTabs()) {
        event.preventDefault()
        setActivityHidesWorkbench(true)
      }
    }
    window.addEventListener('keydown', onChatKeyDown, true)
    window.addEventListener('keydown', onKeyDown)
    // Why: a workspace being created shows its progress in the main area; hidden tabs would hide it.
    const unsubscribeCreation = useAppStore.subscribe((state, previous) => {
      if (
        state.activePendingCreationId !== null &&
        state.activePendingCreationId !== previous.activePendingCreationId
      ) {
        setActivityHidesWorkbench(false)
      }
    })
    return () => {
      unsubscribeCreation()
      window.removeEventListener('keydown', onChatKeyDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
