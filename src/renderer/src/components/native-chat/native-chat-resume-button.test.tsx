// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { NativeChatAccountScopeProvider } from './native-chat-account-usage'
import { NativeChatResumeButton } from './native-chat-resume-button'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const sent: [string, string][] = []
vi.mock('./session/terminal/send/native-chat-runtime-send', () => ({
  sendNativeChatTypedCommand: (ptyId: string, command: string) => {
    sent.push([ptyId, command])
  }
}))

it("lists the project's conversations and resumes a pick in this chat's terminal", async () => {
  const LEAF = '11111111-1111-4111-8111-111111111111'
  useAppStore.setState({
    terminalLayoutsByTabId: { 'tab-1': { ptyIdsByLeafId: { [LEAF]: 'pty-1' } } } as never,
    agentStatusByPaneKey: { [`tab-1:${LEAF}`]: { agentType: 'claude', state: 'done' } } as never
  })
  vi.stubGlobal('api', {
    nativeChat: {
      listClaudeProjectSessions: async () => [
        { sessionId: 'current', title: 'This one', firstPrompt: 'hi', updatedAt: Date.now() },
        { sessionId: 'older-1', title: 'Fix the parser', firstPrompt: 'parser bug', updatedAt: 1 }
      ]
    }
  })
  const div = document.createElement('div')
  document.body.appendChild(div)
  await act(async () => {
    createRoot(div).render(
      <TooltipProvider>
        <NativeChatAccountScopeProvider
          agent="claude"
          transcriptPath="/home/projects/-proj/current.jsonl"
          terminalTabId="tab-1"
        >
          <NativeChatResumeButton />
        </NativeChatAccountScopeProvider>
      </TooltipProvider>
    )
  })
  await act(async () => div.querySelector('button')!.click())
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)))
  const option = [...document.querySelectorAll('[role="option"]')].find((el) =>
    el.textContent?.includes('Fix the parser')
  ) as HTMLElement
  expect(option).toBeTruthy()
  await act(async () => option.click())
  expect(sent).toEqual([['pty-1', '/resume older-1']])
  // Closing the list must not hand focus back to the button: that opened its tooltip, and with the
  // pointer elsewhere nothing closed it.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
  expect(document.activeElement).not.toBe(div.querySelector('button'))
  expect(document.querySelector('[role="tooltip"]')).toBeNull()
  vi.unstubAllGlobals()
})
