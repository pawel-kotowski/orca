// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { acceptedAgentStatuses } from '@/store/slices/agent-status/status-ownership/accepted-agent-statuses'
import { toRemoteRuntimePtyId } from '../../../../shared/remote-runtime/remote-runtime-pty-id'

vi.mock('@/runtime/rpc/calls/runtime-rpc-call', () => ({ callRuntimeRpc: vi.fn() }))

import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { NativeChatRemoteAccountSwitch } from './native-chat-account-switch'
import { queueClaudeRestartsAtTurnEnd } from './native-chat-account-restart-at-turn-end'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ROBOTEC = '/home/p/.claude'
const PERSONAL = '/home/p/.claude-logins/personal'
const LEAF = '11111111-1111-4111-8111-111111111111'
const path = (dir: string): string => `${dir}/projects/-repo/s1.jsonl`
const login = (configDir: string, email: string) => ({
  configDir,
  accountId: null,
  email,
  organizationName: null
})
const rpc = vi.mocked(callRuntimeRpc)
const status = (state: 'working' | 'done') =>
  acceptedAgentStatuses([
    [
      `tab:${LEAF}`,
      {
        agentType: 'claude',
        state,
        paneKey: `tab:${LEAF}`,
        prompt: '',
        updatedAt: 0,
        stateStartedAt: 0,
        stateHistory: []
      }
    ]
  ])

let logins: unknown
let root: ReturnType<typeof createRoot>
let div: HTMLDivElement
let answer: (value: unknown) => void

beforeEach(() => {
  logins = {
    logins: [login(ROBOTEC, 'me@robotec.ai'), login(PERSONAL, 'me@gmail.com')],
    movingTo: null,
    backgroundWork: true
  }
  rpc.mockImplementation((async (_target: unknown, method: string) =>
    method === 'nativeChat.claudeLogins'
      ? logins
      : new Promise((resolve) => (answer = resolve))) as never)
  useAppStore.setState({
    terminalLayoutsByTabId: {
      tab: { ptyIdsByLeafId: { [LEAF]: toRemoteRuntimePtyId('term_1', 'robo') } }
    } as never,
    agentStatusByPaneKey: status('done')
  })
  div = document.createElement('div')
  document.body.appendChild(div)
  root = createRoot(div)
})
afterEach(async () => {
  await act(async () => root.unmount())
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function render(dir: string): Promise<void> {
  await act(async () => {
    root.render(
      <NativeChatRemoteAccountSwitch
        name={dir === ROBOTEC ? 'robotec' : 'personal'}
        environmentId="robo"
        terminalTabId="tab"
        transcriptPath={path(dir)}
      />
    )
  })
}

async function pick(text: string): Promise<void> {
  await act(async () => {
    div
      .querySelector('button')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
    el.textContent?.includes(text)
  ) as HTMLElement
  await act(async () => item.click())
}

it("offers the host's logins and moves the chat's terminal there, naming both until it is", async () => {
  await render(ROBOTEC)
  await act(async () => {
    div
      .querySelector('button')!
      .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
  })
  const menu = document.querySelector('[role="menu"]')!
  expect(menu.textContent).toContain('robotecme@robotec.aipersonalme@gmail.com')
  expect(menu.textContent).toContain('Commands it runs in the background stop.')
  const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
    el.textContent?.includes('personal')
  ) as HTMLElement
  await act(async () => item.click())
  expect(rpc).toHaveBeenLastCalledWith(
    { kind: 'environment', environmentId: 'robo' },
    'nativeChat.moveClaudeLogin',
    { terminal: 'term_1', configDir: PERSONAL, transcriptPath: path(ROBOTEC) },
    expect.anything()
  )
  expect(div.textContent).toBe('robotec → personal')
  await act(async () => answer({ outcome: 'moved' }))
  await render(PERSONAL)
  expect(div.textContent).toBe('personal')
})

it('a refused move leaves the footer as it was', async () => {
  await render(ROBOTEC)
  await pick('personal')
  await act(async () => answer({ outcome: 'refused', reason: 'terminal_busy' }))
  expect(div.textContent).toBe('robotec')
})

it('plain text for a host with one login or an older build', async () => {
  logins = { logins: [login(ROBOTEC, 'me@robotec.ai')], movingTo: null, backgroundWork: false }
  await render(ROBOTEC)
  expect(div.querySelector('button')).toBeNull()
  rpc.mockRejectedValue(new Error('method_not_found'))
  await render(PERSONAL)
  expect(div.querySelector('button')).toBeNull()
})

it("a laptop chat's switch waits for the running turn", () => {
  const queued: string[][] = []
  useAppStore.setState({
    terminalLayoutsByTabId: { tab: { ptyIdsByLeafId: { [LEAF]: 'pty-1' } } } as never,
    agentStatusByPaneKey: status('working'),
    queuePaneAccountRestarts: (ptyIds: string[]) => void queued.push(ptyIds)
  })
  queueClaudeRestartsAtTurnEnd('tab', ['pty-1'])
  expect(queued).toEqual([])
  useAppStore.setState({ agentStatusByPaneKey: status('done') })
  expect(queued).toEqual([['pty-1']])
  useAppStore.setState({ agentStatusByPaneKey: status('done') })
  expect(queued).toEqual([['pty-1']])
})
