import { useLayoutEffect, type RefObject } from 'react'

/**
 * Publish the lines' height on the chat root (`--native-chat-tasks-strip-height`), so Jump to
 * latest, when it sits above the message box, sits above the lines too.
 */
export function usePublishActivityLinesHeight(ref: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const element = ref.current
    const root = element?.closest<HTMLElement>('[data-native-chat-root="true"]')
    if (!element || !root || typeof ResizeObserver === 'undefined') {
      return
    }
    const publish = (): void =>
      root.style.setProperty('--native-chat-tasks-strip-height', `${element.offsetHeight}px`)
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(element)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--native-chat-tasks-strip-height')
    }
  }, [ref])
}
