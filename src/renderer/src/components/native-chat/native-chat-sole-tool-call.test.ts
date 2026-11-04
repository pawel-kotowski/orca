import { describe, expect, it } from 'vitest'
import type { NativeChatBlock } from '../../../../shared/native-chat/native-chat-types'
import { nativeChatSoleToolCall } from './native-chat-sole-tool-call'

const call = (callId: string, name = 'Bash'): NativeChatBlock => ({
  type: 'tool-call',
  name,
  callId,
  input: { command: 'ls', description: 'List files' },
  state: 'completed'
})
const result = (callId: string): NativeChatBlock => ({ type: 'tool-result', callId, output: 'a b' })

describe('nativeChatSoleToolCall', () => {
  it('names the one command of a run, with its result', () => {
    const sole = nativeChatSoleToolCall([call('c1'), result('c1')])
    expect(sole?.call).toMatchObject({ callId: 'c1' })
    expect(sole?.result).toMatchObject({ output: 'a b' })
  })

  it('keeps the run for two calls, or for an edit whose diff card the run draws', () => {
    expect(nativeChatSoleToolCall([call('c1'), result('c1'), call('c2')])).toBeNull()
    expect(nativeChatSoleToolCall([call('e1', 'Edit')])).toBeNull()
  })
})
