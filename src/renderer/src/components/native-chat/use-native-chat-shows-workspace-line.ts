import { useAppStore } from '@/store'
import { nativeChatShowsComposerWorkspaceLine } from '../../../../shared/native-chat/native-chat-appearance-settings'

// Why: some tests stand a plain object in for the store; upstream's default (shown) holds there.
export const useNativeChatShowsWorkspaceLine: () => boolean =
  typeof useAppStore === 'function'
    ? () => useAppStore((state) => nativeChatShowsComposerWorkspaceLine(state.settings))
    : () => true
