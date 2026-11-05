import { useMemo } from 'react'
import type { AgentType } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { NativeChatMessage } from '../../../../shared/native-chat/native-chat-types'
import type { NativeChatStructuredComposerTransport } from './native-chat-composer-types'
import {
  summarizeContextUsage,
  type NativeChatContextUsageSummary
} from './native-chat-context-usage-summary'
import { useNativeChatAccountScope } from './native-chat-account-usage'
import { useNativeChatTranscriptContextUsage } from './native-chat-transcript-context-usage'

const NO_MESSAGES: readonly NativeChatMessage[] = []

/**
 * The context readout's input: the structured journal's report, or for a terminal-backed chat,
 * which has no journal, its transcript's newest reply against the model's window.
 */
export function useNativeChatContextUsageSummary(
  structuredTransport: NativeChatStructuredComposerTransport | undefined,
  agent: AgentType,
  conversation: { messages: readonly NativeChatMessage[] } | undefined
): NativeChatContextUsageSummary | null {
  const usage = structuredTransport?.contextUsage ?? null
  const structured = useMemo(() => (usage ? summarizeContextUsage(usage) : null), [usage])
  const scope = useNativeChatAccountScope()
  const transcript = useNativeChatTranscriptContextUsage(
    agent,
    structuredTransport ? null : scope?.transcriptPath,
    conversation?.messages ?? NO_MESSAGES
  )
  return structured ?? transcript
}
