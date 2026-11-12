// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TranslationScopeProvider } from '@/i18n/translation-scope-provider'
import { useAppStore } from '@/store'
import { MessageRow } from '@/components/native-chat/messages/rows/NativeChatMessageRow'
import { agentSessionFailureWords } from '../../../../../../shared/agent-session/failures/agent-session-failure-words'
import { agentSessionFailureFact } from '../../../../../../shared/agent-session/failures/agent-session-failure'
import { structuredAgentSessionStatusBlock } from '../../../../../../shared/agent-session/view/structured-agent-session-status-block'
import type { NativeChatMessage } from '../../../../../../shared/native-chat/native-chat-types'
import type { NativeChatComposerHandle } from '../../composer/native-chat-composer-types'
import { NativeChatTerminalUsageLimitProvider } from './NativeChatTerminalUsageLimitProvider'
import {
  terminalAutoContinueSettled,
  terminalContinueError
} from './native-chat-terminal-pane-store'

const PANE = 'tab-1:3f1c2a4e-1111-4222-8333-944455556666'
const START = new Date(2026, 10, 12, 18).getTime()

function limitMessage(resetsAt: number): NativeChatMessage {
  const row = agentSessionFailureWords(
    agentSessionFailureFact('usageLimitReached', { usageLimit: { window: 'session', resetsAt } }),
    { agentName: 'Claude', provider: 'claude', surface: 'row' }
  )
  return {
    id: 'limit',
    role: 'system',
    source: 'transcript',
    timestamp: START - 60 * 60_000,
    blocks: [
      structuredAgentSessionStatusBlock(
        { kind: 'status', tone: 'warning', ...row },
        { kind: 'turn', turnItemId: 'limit' }
      )
    ]
  }
}

function renderChat(
  message: NativeChatMessage,
  resend: (text: string) => boolean,
  handOff?: () => void
) {
  const composerRef = {
    current: {
      resend: vi.fn(resend),
      focus: vi.fn(() => true)
    } as unknown as NativeChatComposerHandle
  }
  render(
    <TooltipProvider>
      <NativeChatTerminalUsageLimitProvider
        paneKey={PANE}
        terminalTabId="tab-1"
        agent="claude"
        transcriptPath={null}
        messages={[message]}
        isWorking={false}
        composerRef={composerRef}
        handOff={handOff}
      >
        <MessageRow message={message} expandSignal={false} onScrollMessageToTop={vi.fn()} />
      </NativeChatTerminalUsageLimitProvider>
    </TooltipProvider>,
    { wrapper: TranslationScopeProvider }
  )
  return composerRef.current.resend
}

function setAutoContinue(on: boolean): void {
  const settings = useAppStore.getState().settings
  useAppStore.setState({
    settings: { ...settings, nativeChatAutoContinueAfterUsageLimit: on } as typeof settings
  })
}

describe('a terminal chat stopped by its usage limit', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: START,
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
    })
    setAutoContinue(false)
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    terminalContinueError.set(PANE, undefined)
    terminalAutoContinueSettled.set(PANE, undefined)
  })

  it('types the continue message through the composer once the limit reset', () => {
    const resend = renderChat(limitMessage(START - 60_000), () => true)
    fireEvent.click(screen.getByRole('button', { name: /Continue Now/ }))
    expect(resend).toHaveBeenCalledWith('Continue where you left off.')
    expect(terminalContinueError.get(PANE)).toBeUndefined()
  })

  it("offers the pane's own Hand Off to Another Agent on the limit row", () => {
    const handOff = vi.fn()
    renderChat(limitMessage(START - 60_000), () => true, handOff)
    fireEvent.click(screen.getByRole('button', { name: /Hand Off/ }))
    expect(handOff).toHaveBeenCalledTimes(1)
  })

  it("says so with the composer's notices when the continue could not be typed", () => {
    renderChat(limitMessage(START - 60_000), () => false)
    fireEvent.click(screen.getByRole('button', { name: /Continue Now/ }))
    expect(terminalContinueError.get(PANE)).toMatchObject({
      kind: 'error',
      text: "Couldn't continue this chat. Try again, or send a message."
    })
  })

  it('points at the setting while continuing at the reset is off', () => {
    renderChat(limitMessage(START + 60 * 60_000), () => true)
    expect(screen.queryByRole('button', { name: /Continue Now/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Continue automatically/ })).toBeInTheDocument()
  })

  it('continues by itself at the reset when the setting is on, unless cancelled', () => {
    setAutoContinue(true)
    const resetsAt = START + 10 * 60_000
    const resend = renderChat(limitMessage(resetsAt), () => true)
    expect(screen.getByText(/Orca will continue this chat at/)).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(10 * 60_000)
    })
    expect(resend).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(resend).toHaveBeenCalledTimes(1)
    expect(resend).toHaveBeenCalledWith('Continue where you left off.')
  })

  it('does not continue at the reset once the person cancels', () => {
    setAutoContinue(true)
    const resend = renderChat(limitMessage(START + 10 * 60_000), () => true)
    fireEvent.click(screen.getByRole('button', { name: "Don't continue" }))
    expect(screen.getByText(/won't continue this chat automatically/)).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(60 * 60_000)
    })
    expect(resend).not.toHaveBeenCalled()
  })
})
