// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  state: {
    sidebarBody: 'agents',
    settings: { floatingTerminalEnabled: true },
    floatingWorkspacePanelOpen: true
  } as Record<string, unknown>,
  hideFloatingWorkspacePanel: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign(() => undefined, {
    getState: () => mocks.state,
    subscribe: () => () => {}
  })
}))
vi.mock('@/lib/floating-workspace-panel-reveal', () => ({
  hideFloatingWorkspacePanel: mocks.hideFloatingWorkspacePanel
}))

import {
  activityHidesWorkbench,
  setActivityHidesWorkbench,
  useActivityEscapeHidesWorkbench,
  useActivityInterruptPrompt
} from './activity-workbench-visibility'

function floatingChat(working: boolean): {
  box: HTMLElement
  chatKeyDown: ReturnType<typeof vi.fn>
} {
  const panel = document.createElement('div')
  panel.setAttribute('data-floating-terminal-panel', '')
  const chat = document.createElement('div')
  chat.setAttribute('data-native-chat-root', '')
  chat.setAttribute('data-native-chat-working', String(working))
  const box = document.createElement('div')
  box.setAttribute('contenteditable', 'true')
  box.tabIndex = 0
  chat.append(box)
  panel.append(chat)
  document.body.append(panel)
  const chatKeyDown = vi.fn()
  box.addEventListener('keydown', chatKeyDown)
  return { box, chatKeyDown }
}

function pressEscape(target: HTMLElement): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  )
}

describe('Escape in the floating workspace in the activity view', () => {
  beforeEach(() => {
    mocks.hideFloatingWorkspacePanel.mockReset()
    // The activity view hides the main tabs while the floating panel shows its agent.
    setActivityHidesWorkbench(true)
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('closes the panel from an idle chat without the chat seeing the key', () => {
    renderHook(() => useActivityEscapeHidesWorkbench())
    const { box, chatKeyDown } = floatingChat(false)
    pressEscape(box)
    expect(chatKeyDown).not.toHaveBeenCalled()
    expect(mocks.hideFloatingWorkspacePanel).toHaveBeenCalledTimes(1)
    expect(activityHidesWorkbench()).toBe(true)
  })

  it('asks first when its agent works, and Hide workspace closes the panel', () => {
    renderHook(() => useActivityEscapeHidesWorkbench())
    const prompt = renderHook(() => useActivityInterruptPrompt())
    const { box, chatKeyDown } = floatingChat(true)
    pressEscape(box)
    expect(chatKeyDown).not.toHaveBeenCalled()
    expect(mocks.hideFloatingWorkspacePanel).not.toHaveBeenCalled()
    prompt.rerender()
    expect(prompt.result.current.open).toBe(true)
    prompt.result.current.hide()
    expect(mocks.hideFloatingWorkspacePanel).toHaveBeenCalledTimes(1)
  })

  it('Stop agent hands the chat its Escape', () => {
    renderHook(() => useActivityEscapeHidesWorkbench())
    const prompt = renderHook(() => useActivityInterruptPrompt())
    const { box, chatKeyDown } = floatingChat(true)
    pressEscape(box)
    prompt.rerender()
    prompt.result.current.stop()
    expect(chatKeyDown).toHaveBeenCalledTimes(1)
    expect(mocks.hideFloatingWorkspacePanel).not.toHaveBeenCalled()
  })
})
