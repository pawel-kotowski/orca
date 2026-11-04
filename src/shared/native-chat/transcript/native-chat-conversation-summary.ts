import type { NativeChatMessage } from '../native-chat-types'
import { normalizedNativeChatUserMessageText } from './native-chat-image-transcript-markers'

/** One thing the agent did in the latest turn, as the chat shows it. */
export type NativeChatConversationStep = {
  /** The agent's own words: its narration of what it is doing. */
  kind: 'said'
  text: string
}

/** A conversation at a glance: what it was asked first and last, what it did since, its answer. */
export type NativeChatConversationSummary = {
  /** Null when the loaded window starts after the first prompt. */
  firstPrompt: string | null
  lastPrompt: string | null
  /** The latest turn's narration lines, newest last, at most `stepLimit`. */
  steps: NativeChatConversationStep[]
  /** The agent's last words once the turn is done. */
  finalAnswer: string | null
}

const MAX_STEP_CHARS = 200

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_STEP_CHARS ? `${flat.slice(0, MAX_STEP_CHARS - 1)}…` : flat
}

// Messages the harness writes as the user (a background task's notification, a reminder, a slash
// command's wrapper) are not prompts a person typed.
const HARNESS_USER_MESSAGE =
  /^<(?:task-notification|system-reminder|local-command-[a-z-]+|command-[a-z-]+|bash-[a-z-]+|user-prompt-submit-hook)\b/

function userPrompt(message: NativeChatMessage): string | null {
  if (message.role !== 'user') {
    return null
  }
  const text = normalizedNativeChatUserMessageText(message)?.trim()
  return text && !HARNESS_USER_MESSAGE.test(text) ? text : null
}

/**
 * Summarize a decoded transcript for a glance (the activity view): its first and last prompt,
 * the steps of the latest turn as the chat UI names them, and the answer once that turn is done.
 */
export function summarizeNativeChatConversation(
  messages: readonly NativeChatMessage[],
  {
    working,
    startsAtFirstMessage,
    stepLimit = 3
  }: { working: boolean; startsAtFirstMessage: boolean; stepLimit?: number }
): NativeChatConversationSummary {
  let firstPrompt: string | null = null
  let lastPrompt: string | null = null
  let lastPromptIndex = -1
  for (const [index, message] of messages.entries()) {
    const prompt = userPrompt(message)
    if (prompt === null) {
      continue
    }
    firstPrompt ??= prompt
    lastPrompt = prompt
    lastPromptIndex = index
  }
  const steps: NativeChatConversationStep[] = []
  for (const message of messages.slice(lastPromptIndex + 1)) {
    if (message.role !== 'assistant') {
      continue
    }
    for (const block of message.blocks) {
      // Why: a glance reads the agent's own narration; its commands stay in the chat.
      if (block.type === 'text' && block.text.trim()) {
        steps.push({ kind: 'said', text: oneLine(block.text) })
      }
    }
  }
  let finalAnswer: string | null = null
  if (!working && steps.at(-1)?.kind === 'said') {
    // Keep the answer whole; the card clamps it, the steps list does not repeat it.
    const lastText = messages
      .slice(lastPromptIndex + 1)
      .flatMap((message) =>
        message.role === 'assistant'
          ? message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : []))
          : []
      )
      .findLast((text) => text.trim())
    finalAnswer = lastText?.trim() ?? null
    steps.pop()
  }
  return {
    firstPrompt: startsAtFirstMessage ? firstPrompt : null,
    lastPrompt,
    steps: steps.slice(-stepLimit),
    finalAnswer
  }
}
