import { useAppStore } from '@/store'

export const STAGE_FREEZE_ATTR = 'data-agent-show-freeze'

// Why: these draw at the workspace level above the pane, so a copy of the pane would cover them blank.
const LIVE_SURFACES = new Set(['terminal', 'agent-session', 'browser', 'simulator'])

// Why: a copy repeating these would be found as the pane itself by selectors and the hold's CSS.
const PANE_IDENTITY_ATTRS = ['id', 'data-tab-group-body-id', 'data-tab-group-strip-id']

function paneShowsLiveSurface(groupId: string): boolean {
  const state = useAppStore.getState()
  for (const groups of Object.values(state.groupsByWorktree)) {
    const group = groups.find((candidate) => candidate.id === groupId)
    if (group) {
      const front = state.unifiedTabsByWorktree[group.worktreeId]?.find(
        (tab) => tab.id === group.activeTabId
      )
      return !!front && LIVE_SURFACES.has(front.contentType)
    }
  }
  return false
}

/** Canvases (Monaco's rulers) clone empty, and scroll offsets clone at zero: carry both over. */
function copyPaintedState(source: HTMLElement, copy: HTMLElement): void {
  const sourceCanvases = source.querySelectorAll('canvas')
  const copyCanvases = copy.querySelectorAll('canvas')
  sourceCanvases.forEach((canvas, index) => {
    try {
      copyCanvases[index]?.getContext('2d')?.drawImage(canvas, 0, 0)
    } catch {
      // A canvas that cannot be read (a WebGL one) stays empty in the copy for a few frames.
    }
  })
  const sourceElements = source.querySelectorAll('*')
  const copyElements = copy.querySelectorAll('*')
  sourceElements.forEach((element, index) => {
    if (element.scrollTop !== 0 || element.scrollLeft !== 0) {
      const twin = copyElements[index]
      if (twin) {
        twin.scrollTop = element.scrollTop
        twin.scrollLeft = element.scrollLeft
      }
    }
  })
}

/**
 * Lays a still copy of the pane (tab strip and content, as painted now) over it, so a show can
 * remount, refit and scroll the real one underneath and swap to it in one frame. Returns the
 * removal, or null for a pane with nothing to copy (not drawn, or a live surface).
 */
export function freezeStagePane(groupId: string): (() => void) | null {
  const body = document.querySelector<HTMLElement>(
    `[data-tab-group-body-id="${CSS.escape(groupId)}"]`
  )
  const panel = body?.parentElement
  if (!panel || paneShowsLiveSurface(groupId)) {
    return null
  }
  const rect = panel.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    return null
  }
  const copy = panel.cloneNode(true) as HTMLElement
  for (const element of [copy, ...copy.querySelectorAll<HTMLElement>('*')]) {
    PANE_IDENTITY_ATTRS.forEach((name) => element.removeAttribute(name))
  }
  copy.style.width = '100%'
  copy.style.height = '100%'
  const frame = document.createElement('div')
  frame.setAttribute(STAGE_FREEZE_ATTR, groupId)
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, {
    position: 'fixed',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    display: 'flex',
    overflow: 'hidden',
    pointerEvents: 'none',
    // Why 9: the held panes below are hidden; the floating sidebar toggles (10) stay on top.
    zIndex: '9'
  })
  frame.appendChild(copy)
  document.body.appendChild(frame)
  copyPaintedState(panel, copy)
  return () => frame.remove()
}
