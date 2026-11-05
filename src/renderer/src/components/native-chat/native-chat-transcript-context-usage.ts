import { useEffect, useMemo, useState } from 'react'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import { deriveNativeChatContextUsage } from '../../../../shared/native-chat/native-chat-context-usage'
import type { NativeChatContextUsageSummary } from './native-chat-context-usage-summary'

type ContextWindows = Readonly<Record<string, number>>

/**
 * How full a terminal-backed Claude chat's context window is: the newest reply's own token count
 * (what the model read for it, as Claude reports it in the transcript) against the window Claude
 * Code's model catalog gives that model. Null when either is unknown.
 */
export function transcriptContextUsageSummary(
  messages: readonly NativeChatMessage[],
  windows: ContextWindows
): NativeChatContextUsageSummary | null {
  const usage = deriveNativeChatContextUsage(messages, (message) =>
    message.model ? (windows[message.model] ?? null) : null
  )
  if (!usage || usage.windowTokens === null || usage.percentage === null) {
    return null
  }
  // Why: more used than the catalog's window means the session runs a larger window than listed
  // (a 1M variant of a 200k model), so the listed window would overstate how full it is.
  if (usage.usedTokens > usage.windowTokens) {
    return null
  }
  return {
    usedTokens: usage.usedTokens,
    windowTokens: usage.windowTokens,
    percentage: usage.percentage,
    estimated: false,
    rows: []
  }
}

function newestModel(messages: readonly NativeChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const model = messages[index]!.model
    if (model) {
      return model
    }
  }
  return null
}

const CATALOG_REREAD_MS = 60_000
const windowsByTranscript = new Map<string, { windows: ContextWindows; readAt: number }>()

async function readContextWindows(transcriptPath: string, model: string): Promise<ContextWindows> {
  const cached = windowsByTranscript.get(transcriptPath)
  // Why reread only for an unlisted model: the catalog changes when Claude Code refetches it,
  // which matters when the chat switches to a model the last read did not list.
  if (cached && (model in cached.windows || Date.now() - cached.readAt < CATALOG_REREAD_MS)) {
    return cached.windows
  }
  const read = window.api?.nativeChat?.getClaudeContextWindows
  const windows = read ? await read(transcriptPath).catch(() => ({})) : {}
  windowsByTranscript.set(transcriptPath, { windows, readAt: Date.now() })
  return windows
}

/** The context-window readout for a terminal-backed Claude chat, from its transcript. */
export function useNativeChatTranscriptContextUsage(
  agent: AgentType,
  transcriptPath: string | null | undefined,
  messages: readonly NativeChatMessage[]
): NativeChatContextUsageSummary | null {
  const path = agent === 'claude' && transcriptPath ? transcriptPath : null
  const model = path ? newestModel(messages) : null
  // Kept with the transcript it was read for: another account's catalog can size a model differently.
  const [read, setRead] = useState<{ path: string; windows: ContextWindows } | null>(null)
  useEffect(() => {
    if (!path || !model) {
      return
    }
    let live = true
    void readContextWindows(path, model).then((windows) => {
      if (live) {
        setRead({ path, windows })
      }
    })
    return () => {
      live = false
    }
  }, [path, model])
  const windows = read && read.path === path ? read.windows : null
  return useMemo(
    () => (windows ? transcriptContextUsageSummary(messages, windows) : null),
    [messages, windows]
  )
}
