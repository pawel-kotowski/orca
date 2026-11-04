import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { nativeChatFinishedTurnsOpen } from '../../../../shared/native-chat/native-chat-appearance-settings'
import { nativeChatOpenTurnKeys } from './native-chat-expanded-keys'

/**
 * The turns drawn open. A finished turn keeps all the agent said in it (as the terminal does)
 * unless "Keep everything the agent said" is off; the reader's toggles flip single turns.
 */
export function useNativeChatOpenTurnIds(
  turnKeys: readonly (string | undefined)[],
  toggledTurnIds: ReadonlySet<string>
): ReadonlySet<string> {
  const turnsOpen = useAppStore((state) => nativeChatFinishedTurnsOpen(state.settings))
  return useMemo(
    () => nativeChatOpenTurnKeys(turnKeys, toggledTurnIds, turnsOpen),
    [toggledTurnIds, turnKeys, turnsOpen]
  )
}
