import { useNativeChatSessionOptionCommand } from '../../session/options/terminal/use-native-chat-session-option-command'
import { useNativeChatSessionOptions } from '../../session/options/terminal/use-native-chat-session-options'
import type { NativeChatComposerProps } from '../native-chat-composer-types'
import type {
  SessionOptionDescriptor,
  SessionOptionsSurface
} from '../../../../../../shared/native-chat/input/native-chat-session-options'

type ComposerSessionOptionsArgs = Pick<
  NativeChatComposerProps,
  | 'agent'
  | 'terminalTabId'
  | 'targetPtyId'
  | 'paneKey'
  | 'onSlashCommand'
  | 'onSubmitted'
  | 'onSwitchToTerminal'
  | 'readTerminalScreen'
  | 'structuredTransport'
> &
  Pick<Parameters<typeof useNativeChatSessionOptionCommand>[0], 'disabled' | 'resolveTarget'> &
  Pick<Parameters<typeof useNativeChatSessionOptions>[0], 'transcriptModel'>

export function useNativeChatComposerSessionOptions({
  agent,
  disabled,
  onSlashCommand,
  onSubmitted,
  resolveTarget,
  terminalTabId,
  targetPtyId,
  onSwitchToTerminal,
  readTerminalScreen,
  paneKey,
  structuredTransport,
  transcriptModel
}: ComposerSessionOptionsArgs): {
  isDispatching: boolean
  pty: ReturnType<typeof useNativeChatSessionOptions>
  surface: SessionOptionsSurface | null
  snapshot: SessionOptionDescriptor[]
} {
  const { dispatch, isDispatching } = useNativeChatSessionOptionCommand({
    agent,
    disabled,
    onSlashCommand,
    onSubmitted,
    resolveTarget
  })
  const pty = useNativeChatSessionOptions({
    agent,
    terminalTabId,
    targetPtyId,
    dispatchCommand: dispatch,
    onAgentPicker: onSwitchToTerminal,
    readTerminalScreen,
    paneKey,
    // Local: a Claude chat names its model even after the frame that showed it scrolled away.
    transcriptModel
  })
  return {
    isDispatching,
    pty,
    surface: structuredTransport?.optionsSurface ?? pty.surface,
    snapshot: structuredTransport?.optionSnapshot ?? pty.snapshot
  }
}
