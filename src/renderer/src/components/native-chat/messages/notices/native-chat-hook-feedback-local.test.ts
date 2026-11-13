import { describe, expect, it } from 'vitest'
import { hookOutcomeRowBody } from '../../../../../../shared/agent-session/journal/agent-session-hook-outcome'
import { nativeChatHookFeedbackReason } from './NativeChatHookFeedbackLine'

describe('nativeChatHookFeedbackReason', () => {
  it.each([
    [['Wait for the build.'], 'Wait for the build.'],
    [['First line.', 'Second line.'], 'First line.\nSecond line.'],
    [[], '']
  ])('reads the hook words back out of the host row (%j)', (details, reason) => {
    expect(nativeChatHookFeedbackReason(hookOutcomeRowBody('sent-back', details).text)).toBe(reason)
  })
})
