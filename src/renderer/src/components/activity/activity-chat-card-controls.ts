import { useEffect, useRef } from 'react'

/**
 * A conversation card's two halves have one job each (Paweł, 2026-11-05: "full responsibility
 * split, left part hovered, right part ws view"): the left half shows or hides the card's hover
 * chat, the right half opens or hides its workspace in the tabs. The hover card owns the chat's
 * open state, so it registers what a click on either half does to it.
 */
type ChatCardControls = { toggle: () => void; hide: () => void }

const controlsByPane = new Map<string, ChatCardControls>()

/** Register a card's hover chat controls while it shows a conversation. */
export function useActivityChatCardControls(
  paneKey: string,
  enabled: boolean,
  controls: ChatCardControls
): void {
  const latest = useRef(controls)
  latest.current = controls
  useEffect(() => {
    if (!enabled) {
      return undefined
    }
    const entry: ChatCardControls = {
      toggle: () => latest.current.toggle(),
      hide: () => latest.current.hide()
    }
    controlsByPane.set(paneKey, entry)
    return () => {
      if (controlsByPane.get(paneKey) === entry) {
        controlsByPane.delete(paneKey)
      }
    }
  }, [enabled, paneKey])
}

type CardClick = {
  clientX: number
  detail: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/**
 * What a click on a conversation card does: 'chat' when the left half was clicked (its hover
 * chat toggled, nothing else), 'workspace' otherwise (the chat steps aside; the caller opens the
 * workspace). Keyboard activation (detail 0) and modified clicks (multi-select) open as before.
 */
export function routeActivityCardClick(
  paneKey: string,
  card: Element,
  event: CardClick
): 'chat' | 'workspace' {
  const controls = controlsByPane.get(paneKey)
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
  if (!controls || modified || event.detail === 0) {
    return 'workspace'
  }
  const rect = card.getBoundingClientRect()
  if (event.clientX < rect.left + rect.width / 2) {
    controls.toggle()
    return 'chat'
  }
  controls.hide()
  return 'workspace'
}
