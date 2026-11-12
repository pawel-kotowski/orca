// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'

const mocks = vi.hoisted(() => ({ openHistory: vi.fn() }))

vi.mock('../../../../store/index', () => {
  const state = { activeWorktreeId: null, activeWorkspaceExecutionHostId: null }
  return { useAppStore: { getState: () => state } }
})
vi.mock('../../pane/ownership/native-chat-tab-owner', () => ({
  findNativeChatTabOwnerWorktreeId: () => 'wt-terminal'
}))
vi.mock('../../../right-sidebar/ai-vault/scope/ai-vault-panel-workspace', () => ({
  selectAiVaultPanelWorkspace: () => ({ worktree: { id: 'wt-1' }, repo: null })
}))
vi.mock('../../../right-sidebar/ai-vault/panel/agent-session-history-modal', () => ({
  openAgentSessionHistoryModal: mocks.openHistory
}))

import { useNativeChatResumeCommand } from './use-native-chat-resume-command'
import { openNativeChatSessionHistory } from './native-chat-session-history-open'

function renderResume(agent: AgentType, structuredWorktreeId?: string) {
  const setNotice = vi.fn()
  const setDraft = vi.fn()
  const { result } = renderHook(() =>
    useNativeChatResumeCommand({
      structuredTransport: structuredWorktreeId ? { worktreeId: structuredWorktreeId } : undefined,
      agent,
      terminalTabId: 'tab-1',
      picker: {
        autocomplete: { mode: 'none' },
        isPickedSkill: () => false,
        clearSkillOrigin: vi.fn()
      },
      editor: {
        textareaRef: { current: null },
        setDraft,
        setCaret: vi.fn(),
        setActiveSuggestion: vi.fn()
      },
      setNotice
    })
  )
  return { result, setNotice, setDraft }
}

describe('/resume and the Resume button (local)', () => {
  beforeEach(() => {
    mocks.openHistory.mockReset()
  })

  it('opens Session History in a terminal-backed chat too, where a pick does not replace it', () => {
    const { result, setDraft } = renderResume('codex')

    expect(result.current.consume('/resume auth')).toBe(true)

    expect(mocks.openHistory).toHaveBeenCalledWith({
      workspace: { worktreeId: 'wt-terminal' },
      chatTabId: 'tab-1',
      resumesInPlace: false,
      initialQuery: 'auth',
      agent: 'codex'
    })
    expect(setDraft).toHaveBeenCalledWith('')
  })

  it('replaces a structured chat in place', () => {
    const { result } = renderResume('claude', 'wt-structured')

    expect(result.current.consume('/resume auth retry')).toBe(true)

    expect(mocks.openHistory).toHaveBeenCalledWith({
      workspace: { worktreeId: 'wt-structured' },
      chatTabId: 'tab-1',
      resumesInPlace: true,
      initialQuery: 'auth retry',
      agent: 'claude'
    })
  })

  it('leaves /resume to an agent Session History cannot list', () => {
    const { result } = renderResume('unknown')

    expect(result.current.matchesDraft('/resume')).toBe(false)
    expect(result.current.consume('/resume')).toBe(false)
    expect(mocks.openHistory).not.toHaveBeenCalled()
  })

  it('opens from the Resume button without a draft to clear', () => {
    expect(
      openNativeChatSessionHistory({
        terminalTabId: 'tab-2',
        agent: 'claude',
        resumesInPlace: false,
        search: ''
      })
    ).toBeNull()
    expect(mocks.openHistory).toHaveBeenCalledWith(
      expect.objectContaining({ chatTabId: 'tab-2', resumesInPlace: false, agent: 'claude' })
    )
  })
})
