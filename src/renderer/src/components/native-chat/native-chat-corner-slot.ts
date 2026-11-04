import { useLayoutEffect, useState, type RefObject } from 'react'

// Each chat root's corner button row, where Jump to latest joins the message box's buttons.
const slots = new WeakMap<Element, HTMLElement>()
const listeners = new Set<() => void>()

function chatRootOf(element: Element | null): Element | null {
  return element?.closest('[data-native-chat-root="true"]') ?? null
}

function notify(): void {
  for (const listener of listeners) {
    listener()
  }
}

/** Publish a chat's corner row; the returned function withdraws it. */
export function registerNativeChatCornerSlot(slot: HTMLElement): () => void {
  const root = chatRootOf(slot)
  if (!root) {
    return () => {}
  }
  slots.set(root, slot)
  notify()
  return () => {
    if (slots.get(root) === slot) {
      slots.delete(root)
    }
    notify()
  }
}

/** The corner row of the chat `anchor` sits in, once its message box has drawn one. */
export function useNativeChatCornerSlot(anchor: RefObject<Element | null>): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const read = (): void => {
      const root = chatRootOf(anchor.current)
      const next = root ? (slots.get(root) ?? null) : null
      setSlot((current) => (current === next || (next && !next.isConnected) ? current : next))
    }
    read()
    listeners.add(read)
    return () => {
      listeners.delete(read)
    }
  }, [anchor])
  return slot?.isConnected ? slot : null
}
