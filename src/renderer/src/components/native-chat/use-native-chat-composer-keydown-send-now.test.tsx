// @vitest-environment happy-dom

import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNativeChatComposerKeyDown } from './use-native-chat-composer-keydown'

const platform = vi.hoisted(() => ({ mac: true }))
vi.mock('./native-chat-shortcut', () => ({ isMacPlatform: () => platform.mac }))

function setup(ctrlEnterSendsNow: boolean, draft = 'hello') {
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
      ctrlEnterSendsNow,
      setActiveSuggestion: vi.fn(),
      setDraft: vi.fn(),
      setCaret: vi.fn()
    })
  )
  const press = (init: { ctrlKey?: boolean; metaKey?: boolean; repeat?: boolean }): boolean => {
    render(<div data-testid="composer" onKeyDown={hook.result.current} />)
    const notCanceled = fireEvent.keyDown(screen.getByTestId('composer'), { key: 'Enter', ...init })
    cleanup()
    return !notCanceled
  }
  return { send, press }
}

afterEach(() => {
  platform.mac = true
})

describe('Ctrl+Enter sends now in a terminal Claude chat', () => {
  it('sends now on Ctrl+Enter on macOS, where Cmd+Enter keeps its own meaning', () => {
    const { send, press } = setup(true)
    expect(press({ ctrlKey: true })).toBe(true)
    expect(send).toHaveBeenLastCalledWith({ sendNow: true })
    press({ metaKey: true })
    expect(send).toHaveBeenLastCalledWith({ alternate: true })
    press({})
    expect(send).toHaveBeenLastCalledWith()
  })

  it('sends now on Ctrl+Enter on Windows and Linux too', () => {
    platform.mac = false
    const { send, press } = setup(true)
    press({ ctrlKey: true })
    expect(send).toHaveBeenCalledExactlyOnceWith({ sendNow: true })
  })

  it('sends now with an empty box, which pushes the messages Claude holds', () => {
    const { send, press } = setup(true, '')
    press({ ctrlKey: true })
    expect(send).toHaveBeenCalledExactlyOnceWith({ sendNow: true })
  })

  it('does not send again while Ctrl+Enter is held', () => {
    const { send, press } = setup(true)
    expect(press({ ctrlKey: true, repeat: true })).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('keeps the old Ctrl+Enter when the setting is off or the chat cannot send now', () => {
    const mac = setup(false)
    mac.press({ ctrlKey: true })
    expect(mac.send).toHaveBeenCalledExactlyOnceWith()

    platform.mac = false
    const other = setup(false)
    other.press({ ctrlKey: true })
    expect(other.send).toHaveBeenCalledExactlyOnceWith({ alternate: true })
  })
})
