import { useCallback, useLayoutEffect, useRef } from 'react'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { runningTranscriptBackgroundShells } from '../../../../shared/native-chat/transcript/native-chat-transcript-background-shells'

export type ReadShellCommands = () => ReadonlyMap<string, string>

/** The full commands of the shells this conversation started, by the task id the roster names. */
export function structuredChatShellCommands(
  messages: readonly NativeChatMessage[]
): ReadonlyMap<string, string> {
  // Why the epoch: a Monitor past its timeout still names its command while the roster lists it.
  return new Map(
    runningTranscriptBackgroundShells(messages, 0).flatMap(({ id, command }) =>
      command ? [[id, command] as const] : []
    )
  )
}

/** Read on demand: a streamed frame must not redraw the strip, nor scan the chat for it. */
export function useStructuredChatShellCommands(
  messages: readonly NativeChatMessage[] | undefined
): ReadShellCommands {
  const latest = useRef(messages)
  const cache = useRef<{
    messages: readonly NativeChatMessage[]
    commands: ReadonlyMap<string, string>
  } | null>(null)
  useLayoutEffect(() => {
    latest.current = messages
  })
  return useCallback(() => {
    const current = latest.current ?? []
    if (cache.current?.messages !== current) {
      cache.current = { messages: current, commands: structuredChatShellCommands(current) }
    }
    return cache.current.commands
  }, [])
}
