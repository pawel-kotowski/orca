import { ClaudeIcon, GeminiIcon, OpenAIIcon } from '../status-bar/icons'
import type { SessionOptionDescriptor } from '../../../../shared/native-chat/input/native-chat-session-options'

export type NativeChatModelProvider = 'anthropic' | 'openai' | 'google'

/**
 * Whose model the pill names, told from the model's own id and label (Paweł, 2026-11-08: "model
 * in input box should have provider icon"). Null when the name says nothing about its maker.
 */
export function nativeChatModelProvider(
  model: SessionOptionDescriptor,
  label: string
): NativeChatModelProvider | null {
  const value = model.kind.type === 'select' ? model.kind.currentValue : ''
  const name = `${value ?? ''} ${label}`.toLowerCase()
  if (/claude|opus|sonnet|haiku|fable/.test(name)) {
    return 'anthropic'
  }
  if (/gpt|codex|\bo[1-9]\b/.test(name)) {
    return 'openai'
  }
  if (/gemini/.test(name)) {
    return 'google'
  }
  return null
}

/** The maker's logo, at the pill's text size. */
export function NativeChatModelProviderIcon({
  provider
}: {
  provider: NativeChatModelProvider
}): React.JSX.Element {
  return (
    <span className="inline-flex shrink-0" aria-hidden>
      {provider === 'anthropic' ? (
        <ClaudeIcon size={12} />
      ) : provider === 'openai' ? (
        <OpenAIIcon size={12} />
      ) : (
        <GeminiIcon size={12} />
      )}
    </span>
  )
}
