// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import { useNativeChatContextClearFloor } from './use-native-chat-context-clear-floor'

const DIVIDER = {
  kind: 'status',
  contextClear: { operationId: 'clear', afterFence: 1, clearedAt: 1 }
}
const message = (sequence: number) =>
  ({ sequence, body: { kind: 'message', role: 'user', text: 'x' } }) as never
const divider = (sequence: number) => ({ sequence, body: DIVIDER }) as never

it('settles on a divider that lands inside what is drawn while an older one fades', () => {
  const { result, rerender } = renderHook(
    ({ items }: { items: readonly AgentJournalRenderItem[] }) =>
      useNativeChatContextClearFloor('e', items),
    { initialProps: { items: [message(1)] } }
  )
  rerender({ items: [message(1), divider(2)] })
  expect(result.current.clearing).toBe(true)
  rerender({ items: [message(1), divider(2), message(3), message(5)] })
  // Without the fix: "Too many re-renders".
  rerender({ items: [message(1), divider(2), message(3), divider(4), message(5)] })
  expect(result.current.clearing).toBe(false)
  expect(result.current.rows.map((row) => row.sequence)).toEqual([4, 5])
})
