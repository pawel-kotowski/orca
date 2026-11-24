import { useSyncExternalStore } from 'react'
import type { NativeChatRecallSource } from './native-chat-sent-prompt-history'

type SentCommands = NonNullable<NativeChatRecallSource['commands']>

const NONE: SentCommands = []
const commandsByScope = new Map<string, SentCommands>()
const listeners = new Set<() => void>()
let nextId = 0

/** A host command (/compact, /model…) leaves no user row to recall. */
export function noteNativeChatStructuredSentCommand(scopeKey: string, command: string): void {
  nextId += 1
  commandsByScope.set(scopeKey, [
    ...(commandsByScope.get(scopeKey) ?? NONE),
    { id: `structured-${nextId}`, command, sentAt: Date.now() }
  ])
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useNativeChatStructuredSentCommands(scopeKey: string): SentCommands {
  return useSyncExternalStore(subscribe, () => commandsByScope.get(scopeKey) ?? NONE)
}
