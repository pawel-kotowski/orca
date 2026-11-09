import type { NativeChatConversationSummary } from '../../../../shared/native-chat/transcript/native-chat-conversation-summary'
import type { AgentPaneThread } from './activity-thread-types'

/**
 * A card whose transcript Orca cannot read (a closed or finished session, another agent) still
 * draws as every other card, from its status: the last prompt, and the agent's last words as its
 * answer or, while it works, as where it is (Paweł, 2026-11-09: "some cards in activity view have
 * different style"). So the card-part switches and the corner slot apply to it too.
 */
export function activityThreadFallbackSummary(
  thread: AgentPaneThread
): NativeChatConversationSummary {
  const entry = thread.currentAgentEntry ?? thread.paneEntry ?? thread.latestEvent?.entry ?? null
  const prompt = entry?.prompt?.trim() || thread.paneTitle.trim() || null
  const said = entry?.lastAssistantMessage?.trim() || thread.responsePreview.trim() || null
  const working = thread.currentAgentState !== null
  return {
    firstPrompt: prompt,
    lastPrompt: prompt,
    steps: working && said ? [{ kind: 'said', text: said }] : [],
    finalAnswer: working ? null : said
  }
}
