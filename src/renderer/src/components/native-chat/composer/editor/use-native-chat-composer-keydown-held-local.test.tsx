// @vitest-environment happy-dom

import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useNativeChatComposerKeyDown } from './use-native-chat-composer-keydown'

vi.mock('../../pane/routing/native-chat-shortcut', () => ({ isMacPlatform: () => true }))

function pressCtrlEnter(draft: string, steerHead: (() => boolean) | undefined) {
  const send = vi.fn()
  const hook = renderHook(() =>
    useNativeChatComposerKeyDown({
      autocomplete: { mode: 'none' },
      mentionFiles: { files: [], loading: false, failed: false },
      completeMention: vi.fn(),
      activeSuggestion: 0,
      draft,
      isComposing: () => false,
      completePickerItem: vi.fn(),
      dispatchPickerCommand: vi.fn(),
      dismissPicker: vi.fn(),
      interrupt: vi.fn(),
      send,
      ...(steerHead ? { steerHead } : {}),
      ctrlEnterSendsNow: true,
      setActiveSuggestion: vi.fn(),
      setDraft: vi.fn(),
      setCaret: vi.fn()
    })
  )
  render(<div data-testid="composer" onKeyDown={hook.result.current} />)
  fireEvent.keyDown(screen.getByTestId('composer'), { key: 'Enter', ctrlKey: true })
  cleanup()
  return send
}

describe('Ctrl+Enter with messages Orca holds (local)', () => {
  it('on an empty box sends the head held message now instead of the bare chord', () => {
    const steerHead = vi.fn(() => true)
    const send = pressCtrlEnter('', steerHead)
    expect(steerHead).toHaveBeenCalledOnce()
    expect(send).not.toHaveBeenCalled()
  })

  it('falls back to the bare chord when Orca holds nothing', () => {
    expect(pressCtrlEnter('', undefined)).toHaveBeenCalledExactlyOnceWith({ sendNow: true })
    const nothingToSteer = vi.fn(() => false)
    expect(pressCtrlEnter('', nothingToSteer)).toHaveBeenCalledExactlyOnceWith({ sendNow: true })
  })

  it('sends the typed draft now, leaving the held messages alone', () => {
    const steerHead = vi.fn(() => true)
    expect(pressCtrlEnter('mine', steerHead)).toHaveBeenCalledExactlyOnceWith({ sendNow: true })
    expect(steerHead).not.toHaveBeenCalled()
  })
})
