// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { NativeChatAccountSwitch } from './native-chat-account-switch'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const saved: [string, string][] = []
vi.mock('@/lib/workspace-claude-account', () => ({
  saveWorkspaceClaudeAccount: async (worktreeId: string, accountId: string) => {
    saved.push([worktreeId, accountId])
  }
}))

afterEach(() => {
  document.body.innerHTML = ''
})

it('moves the chat: saves the workspace account and restarts only its Claude panes', async () => {
  const queued: string[][] = []
  const previous = useAppStore.getState()
  useAppStore.setState({
    settings: {
      ...previous.settings,
      claudeManagedAccounts: [
        { id: 'acc-a', email: 'pawel@robotec.ai' },
        { id: 'acc-b', email: 'pawel@kyotutechnology.com' }
      ]
    } as typeof previous.settings,
    terminalLayoutsByTabId: {
      tab: {
        ptyIdsByLeafId: {
          '11111111-1111-4111-8111-111111111111': 'pty-claude',
          '22222222-2222-4222-8222-222222222222': 'pty-shell'
        }
      }
    } as never,
    agentStatusByPaneKey: {
      'tab:11111111-1111-4111-8111-111111111111': { agentType: 'claude', state: 'done' }
    } as never,
    queuePaneAccountRestarts: (ptyIds: string[]) => {
      queued.push(ptyIds)
    }
  })
  const div = document.createElement('div')
  document.body.appendChild(div)
  await act(async () => {
    createRoot(div).render(
      <NativeChatAccountSwitch
        name="robotec"
        currentAccountId="acc-a"
        worktreeId="wt"
        terminalTabId="tab"
      />
    )
  })
  const trigger = div.querySelector('button')!
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
    el.textContent?.includes('kyotu')
  ) as HTMLElement
  expect(item).toBeTruthy()
  await act(async () => {
    item.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  expect(saved).toEqual([['wt', 'acc-b']])
  expect(queued).toEqual([['pty-claude']])
})
