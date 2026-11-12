import { terminalPromptSlotNotices } from '../../usage/terminal/native-chat-terminal-pane-store'
import { NativeChatPromptSlotNotices } from './NativeChatComposerNotices'

const NONE: readonly never[] = []

/**
 * The terminal composer's notices above a prompt card, as the structured chat shows them: the card
 * hides the composer, and with it a failed send or a failed Continue. The hidden composer
 * publishes them only while the card owns its input.
 */
export function NativeChatTerminalPromptSlotNotices({
  paneKey
}: {
  paneKey: string
}): React.JSX.Element {
  return (
    <NativeChatPromptSlotNotices notices={terminalPromptSlotNotices.useValue(paneKey) ?? NONE} />
  )
}
