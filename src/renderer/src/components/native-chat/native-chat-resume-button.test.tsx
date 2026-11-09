// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NativeChatAccountScopeProvider } from './native-chat-account-usage'
import { NativeChatResumeButton } from './native-chat-resume-button'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const opened: unknown[] = []
vi.mock('../right-sidebar/ai-vault/panel/agent-session-history-modal', () => ({
  openAgentSessionHistoryModal: (request: unknown) => opened.push(request)
}))
vi.mock('../right-sidebar/ai-vault/scope/ai-vault-panel-workspace', () => ({
  selectAiVaultPanelWorkspace: () => ({ worktree: { id: 'wt' } })
}))
vi.mock('./native-chat-file-link', () => ({ findNativeChatTabOwnerWorktreeId: () => 'wt' }))

it("opens this chat's Session History, resuming a pick in a terminal", async () => {
  const div = document.createElement('div')
  document.body.appendChild(div)
  await act(async () => {
    createRoot(div).render(
      <TooltipProvider>
        <NativeChatAccountScopeProvider agent="claude" transcriptPath={null} terminalTabId="tab-1">
          <NativeChatResumeButton />
        </NativeChatAccountScopeProvider>
      </TooltipProvider>
    )
  })
  await act(async () => div.querySelector('button')!.click())
  expect(opened).toEqual([
    expect.objectContaining({
      workspace: { worktreeId: 'wt' },
      chatTabId: 'tab-1',
      resumesInPlace: false,
      agent: 'claude'
    })
  ])
})
