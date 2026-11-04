import { isToolCallBlock, type NativeChatMessage } from '../native-chat-types'
import {
  nativeChatToolLineLabel,
  NATIVE_CHAT_TOOL_ROW_VERB_COPY
} from '../tools/native-chat-tool-line-label'
import { normalizedNativeChatUserMessageText } from './native-chat-image-transcript-markers'

/** One thing the agent did in the latest turn, as the chat shows it. */
export type NativeChatConversationStep = {
  /** `said`: the agent's own words (a status line); `tool`: a call, by its description. */
  kind: 'said' | 'tool'
  text: string
}

/** A conversation at a glance: what it was asked first and last, what it did since, its answer. */
export type NativeChatConversationSummary = {
  /** Null when the loaded window starts after the first prompt. */
  firstPrompt: string | null
  lastPrompt: string | null
  /** The latest turn's steps, newest last, at most `stepLimit`. */
  steps: NativeChatConversationStep[]
  /** The agent's last words once the turn is done. */
  finalAnswer: string | null
}

const MAX_STEP_CHARS = 200

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_STEP_CHARS ? `${flat.slice(0, MAX_STEP_CHARS - 1)}…` : flat
}

function userPrompt(message: NativeChatMessage): string | null {
  if (message.role !== 'user') {
    return null
  }
  const text = normalizedNativeChatUserMessageText(message)
  return text ? text.trim() : null
}

function toolStepText(block: Parameters<typeof nativeChatToolLineLabel>[0]): string {
  const label = nativeChatToolLineLabel(block)
  if (label.description) {
    return label.description
  }
  if (label.command) {
    return label.target || block.name
  }
  const verb = label.verb ? NATIVE_CHAT_TOOL_ROW_VERB_COPY[label.verb] : null
  if (verb && label.target) {
    return `${verb} ${label.target}`
  }
  // An MCP tool without a readable target reads by its own name.
  return block.name.replace(/^mcp__/, '').replaceAll('__', ' ')
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
      if (block.type === 'text' && block.text.trim()) {
        steps.push({ kind: 'said', text: oneLine(block.text) })
      } else if (isToolCallBlock(block)) {
        steps.push({ kind: 'tool', text: oneLine(toolStepText(block)) })
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
