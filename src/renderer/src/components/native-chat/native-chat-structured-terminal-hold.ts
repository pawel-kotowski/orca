import { useTranslate } from '@/i18n/use-translate'

/** Why Send waits: the conversation has one writer, and it is the terminal's agent now. */
export function useStructuredTerminalSendHold(inTerminal: boolean): string | null {
  const t = useTranslate()
  return inTerminal
    ? t(
        'components.native-chat.terminalSwitch.sendHeld',
        'This conversation is open in a terminal. Bring it back here to write.'
      )
    : null
}
