import { useSyncExternalStore } from 'react'

/**
 * When you last prompted each agent, by pane, read from its transcript the way its card reads it:
 * only your own words, never a background task's notification, Orca's mail notice or another
 * agent's message (Paweł, 2026-11-16: "order in activity view in working and standing by should be
 * always by MY last prompt, only mine"). Every card in Working and Standing by is mounted while its
 * drawer is open, so each publishes its time here; the sort falls back to the turn's start until then.
 */
let promptAtByPaneKey: ReadonlyMap<string, number> = new Map()
const listeners = new Set<() => void>()

export function noteMyPromptAt(paneKey: string, at: number | null): void {
  if (at === null || !Number.isFinite(at) || promptAtByPaneKey.get(paneKey) === at) {
    return
  }
  const next = new Map(promptAtByPaneKey)
  next.set(paneKey, at)
  promptAtByPaneKey = next
  for (const listener of listeners) {
    listener()
  }
}

export function myPromptAt(paneKey: string): number | undefined {
  return promptAtByPaneKey.get(paneKey)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Changes whenever a card publishes a new time, so a sort keyed on it runs again. */
export function useMyPromptTimes(): ReadonlyMap<string, number> {
  return useSyncExternalStore(subscribe, () => promptAtByPaneKey)
}
