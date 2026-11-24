/** Which prompt each session has folded; outside React so a remounted chat keeps it folded. */
export function createStructuredPromptCollapses() {
  const collapsedBySession = new Map<string, string>()
  const listeners = new Set<() => void>()
  const notify = (): void => listeners.forEach((listener) => listener())
  return {
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    isCollapsed: (sessionId: string, occurrence: string): boolean =>
      collapsedBySession.get(sessionId) === occurrence,
    collapse: (sessionId: string, occurrence: string): void => {
      collapsedBySession.set(sessionId, occurrence)
      notify()
    },
    expand: (sessionId: string): void => {
      if (collapsedBySession.delete(sessionId)) {
        notify()
      }
    }
  }
}
