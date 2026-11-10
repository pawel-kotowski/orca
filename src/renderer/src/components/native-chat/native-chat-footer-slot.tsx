import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Chips on the line under the message box (Paweł, 2026-11-10: the workers and shells strips
 * "should take no space until i click"). The footer publishes one slot per chat; a strip draws a
 * chip there and its rows above the box only once the chip is clicked.
 */
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

export function registerNativeChatFooterSlot(slot: HTMLElement): () => void {
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

/** The footer slot of the chat `anchor` sits in, once its message box has drawn one. */
export function useNativeChatFooterSlot(anchor: RefObject<Element | null>): HTMLElement | null {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const read = (): void => {
      const root = chatRootOf(anchor.current)
      const next = root ? (slots.get(root) ?? null) : null
      setSlot((current) => (current === next ? current : next))
    }
    read()
    listeners.add(read)
    return () => {
      listeners.delete(read)
    }
  }, [anchor])
  return slot?.isConnected ? slot : null
}

/** A chip in the chat's footer slot; renders nothing until the footer has drawn its slot. */
export function NativeChatFooterChip({
  anchor,
  pressed,
  title,
  onClick,
  children
}: {
  anchor: RefObject<Element | null>
  /** Null for a chip that acts (opens something) rather than toggles. */
  pressed: boolean | null
  title: string
  onClick: () => void
  children: ReactNode
}): React.JSX.Element | null {
  const slot = useNativeChatFooterSlot(anchor)
  if (!slot) {
    return null
  }
  return createPortal(
    <button
      type="button"
      title={title}
      aria-label={title}
      {...(pressed === null ? {} : { 'aria-pressed': pressed })}
      onClick={onClick}
      className={`inline-flex h-5 max-w-56 min-w-0 shrink-0 cursor-pointer items-center gap-1 rounded px-1 text-2xs outline-none hover:bg-foreground/[0.06] hover:text-chat-foreground focus-visible:ring-1 focus-visible:ring-ring ${
        pressed ? 'bg-foreground/[0.08] text-chat-foreground' : 'text-chat-foreground-faint'
      }`}
    >
      {children}
    </button>,
    slot
  )
}
