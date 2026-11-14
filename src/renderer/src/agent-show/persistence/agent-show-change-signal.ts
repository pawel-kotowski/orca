// Areas call this when what they show changes; persistence listens without the areas importing it.
const listeners = new Set<() => void>()

export function signalAgentShowChange(): void {
  for (const listener of listeners) {
    listener()
  }
}

export function onAgentShowChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
