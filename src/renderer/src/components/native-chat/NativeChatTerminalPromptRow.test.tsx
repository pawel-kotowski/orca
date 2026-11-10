// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NativeChatTerminalBridgeProvider } from './native-chat-terminal-bridge'
import { NativeChatTerminalPromptRow } from './NativeChatTerminalPromptRow'

const RULE = '─'.repeat(40)

describe('NativeChatTerminalPromptRow', () => {
  it("shows the terminal's prompt and answers it in the terminal", () => {
    const show = vi.fn()
    const readScreen = (): string =>
      [
        '● working',
        RULE,
        ' Allow the ibkr server to open a form?',
        ' ❯ 1. Accept',
        '   2. Decline'
      ].join('\r\n')
    const { container } = render(
      <NativeChatTerminalBridgeProvider readScreen={readScreen} show={show}>
        <NativeChatTerminalPromptRow />
      </NativeChatTerminalBridgeProvider>
    )
    expect(container.querySelector('[data-native-chat-ask-row="awaiting"]')).toHaveTextContent(
      /^Awaiting user input$/
    )
    expect(container.querySelector('pre')?.textContent).toBe(
      'Allow the ibkr server to open a form?\n❯ 1. Accept\n  2. Decline'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Answer in terminal' }))
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('keeps the bare label outside a terminal-backed chat', () => {
    const { container } = render(<NativeChatTerminalPromptRow />)
    expect(container.querySelector('[data-native-chat-surface="terminal-prompt"]')).toBeNull()
    expect(container).toHaveTextContent(/^Awaiting user input$/)
  })
})
