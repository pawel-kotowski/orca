import type { RefObject } from 'react'
import { agentSessionPromptQuestions } from '../../../../../shared/agent-session/requests/prompts/agent-session-question-answer'
import { structuredQuestionCard } from '../../../../../shared/native-chat/input/questions/structured-agent-question-card'
import {
  chatApprovalFromJournal,
  type InteractivePromptCard
} from '../../../../../shared/native-chat/input/native-chat-interactive-prompt'
import { NativeChatApprovalCard } from './NativeChatApprovalCard'
import { NativeChatStructuredQuestionCard } from './NativeChatStructuredQuestionCard'
import { NativeChatPromptStrip } from './NativeChatPromptCollapse'
import type { useStructuredPromptResponseHold } from './use-structured-prompt-response-hold'
import type { useStructuredPromptCollapse } from './use-structured-prompt-collapse'

type PromptResponse = ReturnType<typeof useStructuredPromptResponseHold>
type PromptItem = Parameters<PromptResponse['holds']>[0]

/** The chat's own open prompt in the slot above the message box: an approval or a question card,
 *  or its strip while folded. */
export function NativeChatStructuredPromptCard({
  prompt,
  promptResponse,
  collapse,
  stripTakesFocus = false,
  onCancel,
  shouldFocus,
  answerInputRef
}: {
  prompt: PromptItem | null
  promptResponse: PromptResponse
  collapse: ReturnType<typeof useStructuredPromptCollapse>
  /** No message box shows below the fold (a subagent's view is open), so the strip takes focus. */
  stripTakesFocus?: boolean
  onCancel: () => void
  shouldFocus: boolean
  answerInputRef: RefObject<HTMLTextAreaElement | null>
}): React.JSX.Element | null {
  if (prompt?.body.kind !== 'approval' && prompt?.body.kind !== 'question') {
    return null
  }
  const { collapsed } = collapse
  const common = {
    isSubmitting: promptResponse.holds(prompt),
    onCancel,
    onCollapse: collapse.collapse,
    shouldFocus: shouldFocus && !collapsed
  }
  let card: React.JSX.Element
  let strip: NonNullable<InteractivePromptCard>
  if (prompt.body.kind === 'approval') {
    const approval = chatApprovalFromJournal(prompt.body)
    strip = { kind: 'approval', approval }
    card = (
      <NativeChatApprovalCard
        {...common}
        approval={approval}
        onChoose={(optionId) => void promptResponse.respond(prompt, { kind: 'option', optionId })}
      />
    )
  } else {
    const questions = agentSessionPromptQuestions(prompt.body)
    strip = { kind: 'question', prompt: structuredQuestionCard(questions).prompt }
    card = (
      <NativeChatStructuredQuestionCard
        {...common}
        questions={questions}
        onAnswer={(response) => void promptResponse.respond(prompt, response)}
        // Detached while collapsed so a paste cannot edit the hidden draft.
        answerInputRef={collapsed ? undefined : answerInputRef}
      />
    )
  }
  return (
    <>
      {/* Folded, the card stays mounted, so a partly answered question survives. */}
      <div data-native-chat-dock-contents hidden={collapsed} inert={collapsed} className="contents">
        {card}
      </div>
      {collapsed ? (
        <NativeChatPromptStrip
          card={strip}
          onExpand={collapse.expand}
          takeFocus={stripTakesFocus}
        />
      ) : null}
    </>
  )
}
