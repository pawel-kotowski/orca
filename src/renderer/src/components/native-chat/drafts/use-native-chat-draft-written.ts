import { useCallback, useSyncExternalStore } from 'react'
import {
  readNativeChatComposerDraft,
  subscribeToNativeChatComposerDraft
} from './native-chat-composer-draft-store'

/** Whether the box holds words: turns only as it empties or fills, not per keystroke. */
export function useNativeChatDraftWritten(scopeKey: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => subscribeToNativeChatComposerDraft(scopeKey, listener),
    [scopeKey]
  )
  return useSyncExternalStore(
    subscribe,
    () => (readNativeChatComposerDraft(scopeKey)?.text ?? '').trim() !== ''
  )
}
