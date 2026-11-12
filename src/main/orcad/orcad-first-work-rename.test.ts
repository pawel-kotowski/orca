import { beforeEach, describe, expect, it, vi } from 'vitest'

const rename = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('../agent-hooks/first-work/first-work-branch-rename', () => ({
  maybeAutoRenameBranchOnFirstWork: rename
}))
vi.mock('../agent-hooks/first-work/first-work-rename-runtime', () => ({
  firstWorkRenameDeps: () => ({ marker: 'deps' })
}))

import { installOrcadFirstWorkRename } from './orcad-first-work-rename'

type Listener = (event: Record<string, unknown>) => void

function install(): Listener {
  let listener: Listener = () => {}
  installOrcadFirstWorkRename(
    {
      subscribeEnrichedStatus: (next: Listener) => {
        listener = next
        return () => {}
      }
    } as never,
    {} as never,
    {} as never
  )
  return listener
}

const event = {
  paneKey: 'tab:leaf',
  tabId: 'tab',
  worktreeId: 'repo::/w/sandperch',
  payload: { state: 'working', prompt: 'fix the login page', lastAssistantMessage: 'On it' },
  isReplay: false
}

describe('first-work naming on an orcad host', () => {
  beforeEach(() => rename.mockClear())

  it('names a workspace from a live hook turn', async () => {
    install()(event)
    await vi.waitFor(() => expect(rename).toHaveBeenCalled())
    expect(rename).toHaveBeenCalledWith(
      expect.objectContaining({ worktreeId: 'repo::/w/sandperch', prompt: 'fix the login page' }),
      { marker: 'deps' }
    )
  })

  it('ignores restored, identity-only and structured rows', async () => {
    const listener = install()
    listener({ ...event, restoredUnconfirmed: true })
    listener({ ...event, providerSessionOnly: true })
    listener({ ...event, structuredHost: {} })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(rename).not.toHaveBeenCalled()
  })
})
