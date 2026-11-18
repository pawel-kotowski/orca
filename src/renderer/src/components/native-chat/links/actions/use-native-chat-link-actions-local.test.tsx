// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { useRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LinkActionPopover } from '@/components/link-actions/LinkActionPopover'
import CommentMarkdown from '@/components/comment-markdown/CommentMarkdown'
import { useNativeChatLinkActions } from './use-native-chat-link-actions'
import type * as HttpLinkDestinations from '@/lib/browser/navigation/http-link-destinations'
import type * as TerminalLinkOpenHints from '@/components/terminal-pane/links/terminal-link-open-hints'

const mocks = vi.hoisted(() => ({
  linkPlainClick: undefined as 'orca' | 'chrome' | undefined,
  identity: null as { email: string | null; name: string | null } | null,
  projectAccount: null as { email: string } | null
}))

vi.mock('./native-chat-http-link-source-owner', () => ({
  resolveNativeChatHttpLinkSourceOwner: () => ({ kind: 'local' }),
  canNativeChatOpenOwnedBrowser: () => false
}))

vi.mock('../../native-chat-account-usage', () => ({
  useNativeChatClaudeIdentity: () => mocks.identity,
  accountShortName: (email: string) => email.split('@')[0]
}))

vi.mock('@/lib/project-default-claude-identity', () => ({
  projectDefaultClaudeAccount: () => mocks.projectAccount
}))

const openRoutedHttpLink = vi.hoisted(() => vi.fn())
vi.mock('@/lib/browser/navigation/http-link-destinations', async (importOriginal) => ({
  ...(await importOriginal<typeof HttpLinkDestinations>()),
  openRoutedHttpLink
}))

vi.mock('@/components/terminal-pane/links/terminal-link-open-hints', async (importOriginal) => ({
  ...(await importOriginal<typeof TerminalLinkOpenHints>()),
  isMacPlatform: () => true
}))

vi.mock('./use-native-chat-file-link-click', () => ({
  useNativeChatFileLinkClick: () => undefined
}))

vi.mock('../../../../store/index', () => ({
  useAppStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({ openSettingsPage: vi.fn(), openSettingsTarget: vi.fn() }),
    {
      getState: () => ({
        settings: {
          openLinksInApp: true,
          terminalLinkActionPopoverEnabled: true,
          nativeChatAppearance: { linkPlainClick: mocks.linkPlainClick }
        }
      })
    }
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: { children: ReactNode; open: boolean }) =>
    open ? <div>{children}</div> : null,
  PopoverAnchor: () => null,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

const context = { worktreeId: 'wt-1', worktreePath: '/repo', runtimeEnvironmentId: null }

function Transcript({ markdown }: { markdown: string }): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const { onLinkClick, linkActionRequest, closeLinkActions } = useNativeChatLinkActions(
    context,
    rootRef,
    { sessionId: 'session-1', isVisible: true }
  )
  return (
    <div ref={rootRef}>
      <CommentMarkdown
        content={markdown}
        variant="document"
        onLinkClick={onLinkClick}
        allowFileUriLinks
      />
      <LinkActionPopover request={linkActionRequest} onClose={closeLinkActions} />
    </div>
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.identity = null
  mocks.projectAccount = null
  mocks.linkPlainClick = undefined
})

describe('native chat links in a Chrome profile (local)', () => {
  it('swaps the two clicks when Settings says a plain click opens Chrome', async () => {
    const openUrl = vi.fn(async () => {})
    Object.assign(window, { api: { shell: { openUrl } } })
    mocks.linkPlainClick = 'chrome'
    mocks.projectAccount = { email: 'pawel@project.example' }
    render(<Transcript markdown="See [the PR](https://github.com/o/r/pull/1)." />)
    const link = await screen.findByRole('link', { name: 'the PR' })
    fireEvent.click(link)
    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/1', {
      email: 'pawel@project.example',
      name: 'pawel'
    })
    expect(openRoutedHttpLink).not.toHaveBeenCalled()
    fireEvent.click(link, { metaKey: true })
    expect(openRoutedHttpLink).toHaveBeenCalledWith(
      'https://github.com/o/r/pull/1',
      expect.objectContaining({ forceDestination: 'orca' })
    )
    expect(openUrl).toHaveBeenCalledTimes(1)
  })

  it("opens a plain click in Orca's browser, not Chrome", async () => {
    const openUrl = vi.fn(async () => {})
    Object.assign(window, { api: { shell: { openUrl } } })
    mocks.projectAccount = { email: 'pawel@project.example' }
    render(<Transcript markdown="See [the PR](https://github.com/o/r/pull/1)." />)
    fireEvent.click(await screen.findByRole('link', { name: 'the PR' }))
    expect(openUrl).not.toHaveBeenCalled()
    expect(openRoutedHttpLink).toHaveBeenCalledWith(
      'https://github.com/o/r/pull/1',
      expect.objectContaining({ worktreeId: 'wt-1', forceDestination: 'orca' })
    )
    expect(screen.queryByText('System Browser')).toBeNull()
  })

  it("opens a project-less Claude chat's Cmd-clicked link in Chrome's first profile", async () => {
    const openUrl = vi.fn(async () => {})
    Object.assign(window, { api: { shell: { openUrl } } })
    mocks.identity = { email: 'pawel@client.example', name: 'client' }
    render(<Transcript markdown="See [the PR](https://github.com/o/r/pull/1)." />)
    fireEvent.click(await screen.findByRole('link', { name: 'the PR' }), { metaKey: true })
    expect(openRoutedHttpLink).not.toHaveBeenCalled()
    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/1', {
      email: null,
      name: null,
      owner: true
    })
  })

  it("opens a Cmd-clicked link in the profile of the project's default subscription", async () => {
    const openUrl = vi.fn(async () => {})
    Object.assign(window, { api: { shell: { openUrl } } })
    mocks.identity = { email: 'pawel@client.example', name: 'client' }
    mocks.projectAccount = { email: 'pawel@project.example' }
    render(<Transcript markdown="See [the PR](https://github.com/o/r/pull/1)." />)
    fireEvent.click(await screen.findByRole('link', { name: 'the PR' }), { metaKey: true })
    expect(openUrl).toHaveBeenCalledWith('https://github.com/o/r/pull/1', {
      email: 'pawel@project.example',
      name: 'pawel'
    })
  })
})
