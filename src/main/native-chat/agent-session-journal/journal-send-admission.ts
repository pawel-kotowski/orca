import type { AgentSessionSendResult } from '../../../shared/agent-session/agent-session-wire'
import type { AgentMessageSource } from '../../../shared/agent-session/journal/agent-session-message-source'
import type { AgentSessionWireRefusal } from '../../../shared/agent-session/failures/agent-session-wire-refusals'
import type { JournalSubmissionInput } from './journal-store-contracts'

export type JournalContinuationLaunch = { runtimeFence: number; launchFence: number | undefined }

export type JournalSendAdmission = {
  input: JournalSubmissionInput
  fromPerson: boolean
  fromAgent: boolean
  deliveryMode: 'queue' | 'steer'
  queueOnly?: true
  /** Local: the chat is open in a terminal, so the message waits as a card. */
  waits?: true
  /** Local: nobody asked for it, so it is refused unless the chat is at rest, and never queued. */
  atRest?: true
  continuationOfTurnItemId?: string
  expectedContinuationLaunch?: JournalContinuationLaunch
}

export type JournalSendAdmissionResult =
  | { kind: 'admitted'; value: AgentSessionSendResult }
  | { kind: 'immediate' }
  | { kind: 'refused'; refusal: AgentSessionWireRefusal }
  | { kind: 'needs-custody'; source: AgentMessageSource }
