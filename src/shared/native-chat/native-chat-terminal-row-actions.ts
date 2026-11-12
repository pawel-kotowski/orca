// Fork and "Restart from here" in a terminal-backed chat. Its rows come from the agent's own
// transcript, so they carry the transcript's ids but no journal positions: these rules stand in
// for the structured chat's, which read those positions.

import { isRootAgentJournalItem } from '../agent-session/journal/agent-session-journal-producer'
import { nativeChatRowOffersRewind } from './native-chat-rewind-eligibility'
import type { NativeChatMessage } from './native-chat-types'

/** The terminal agents whose conversations Orca can copy into a new tab. */
export type NativeChatTerminalForkAgent = 'claude' | 'codex'

export function nativeChatTerminalForkAgent(agent: string): NativeChatTerminalForkAgent | null {
  // Exact names: OpenClaude writes Claude transcripts but launches as its own CLI.
  return agent === 'claude' || agent === 'codex' ? agent : null
}

/** A finished response of the chat's own agent. Claude copies any turn (Orca cuts the transcript);
 *  Codex forks only whole conversations, so only its newest turn. */
export function nativeChatTerminalRowOffersFork(
  row: {
    message: NativeChatMessage
    inSubagentSection: boolean
    turnWorking: boolean
    inLatestTurn: boolean
  },
  agent: NativeChatTerminalForkAgent
): boolean {
  const { message } = row
  return (
    message.role === 'assistant' &&
    message.source === 'transcript' &&
    !message.agentStart &&
    message.pendingSend === undefined &&
    message.deliveryState === undefined &&
    !row.inSubagentSection &&
    isRootAgentJournalItem(message) &&
    !row.turnWorking &&
    (agent === 'claude' || row.inLatestTurn)
  )
}

/** A prompt Claude recorded in its transcript, so the copy can be cut at the prompt's parent. Claude
 *  only: Codex forks only whole conversations. */
export function nativeChatTerminalPromptRestartable(
  message: NativeChatMessage,
  agent: NativeChatTerminalForkAgent
): boolean {
  return (
    agent === 'claude' &&
    message.role === 'user' &&
    message.source === 'transcript' &&
    message.pendingSend === undefined &&
    message.deliveryState === undefined &&
    isRootAgentJournalItem(message)
  )
}

/** That prompt, drawn as one the person typed to open a top-level turn (the structured chat's
 *  rewind rule): images must still be on disk to go back into the composer. */
export function nativeChatTerminalRowOffersRestart(
  message: NativeChatMessage,
  slot: { depth: number; turnKey: string | undefined },
  hasDeliveryNotice: boolean,
  agent: NativeChatTerminalForkAgent
): boolean {
  return (
    nativeChatTerminalPromptRestartable(message, agent) &&
    nativeChatRowOffersRewind(message, slot, hasDeliveryNotice)
  )
}

/** What goes back into the new chat's composer: the prompt's words and its images on disk. */
export function nativeChatTerminalRestartDraft(message: NativeChatMessage): {
  text: string
  imagePaths: string[]
} {
  const text: string[] = []
  const imagePaths: string[] = []
  for (const block of message.blocks) {
    if (block.type === 'text') {
      text.push(block.text)
    } else if (block.type === 'image-ref' && block.path) {
      imagePaths.push(block.path)
    }
  }
  return { text: text.join('\n\n'), imagePaths }
}

/** No prompt follows the response: it is in the conversation's newest turn, the only one a CLI fork
 *  of the whole conversation ends with. Tool results read as `tool` rows, so they start no turn. */
export function nativeChatTerminalResponseInLatestTurn(
  messages: readonly NativeChatMessage[],
  messageId: string
): boolean {
  const index = messages.findIndex((message) => message.id === messageId)
  return (
    index !== -1 &&
    !messages
      .slice(index + 1)
      .some(
        (message) =>
          message.role === 'user' &&
          message.source === 'transcript' &&
          isRootAgentJournalItem(message)
      )
  )
}
