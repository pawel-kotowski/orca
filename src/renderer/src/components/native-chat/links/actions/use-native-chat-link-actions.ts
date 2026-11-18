import { useCallback, useRef, useState, type RefObject } from 'react'
import {
  closeLinkActionRequest,
  type LinkActionRequest
} from '@/components/link-actions/link-action-request'
import type { CommentMarkdownLinkClickHandler } from '@/components/comment-markdown/comment-markdown-element-renderers'
import { routeNativeChatHref } from '../../../../../../shared/native-chat/file-access/native-chat-href-routing'
import { useAppStore } from '../../../../store/index'
import type { NativeChatFileLinkContext } from './native-chat-file-link-context'
import { resolveNativeChatHttpLinkRouting } from './native-chat-link-target-actions'
import { handleNativeChatWebLink, openNativeChatWebLink } from './native-chat-web-link-actions'
import { httpLinkDirectClickDestination } from '@/lib/browser/navigation/http-link-destinations'
import { isTerminalLinkDirectActivation } from '@/components/terminal-pane/links/gestures/terminal-link-activation'
import { nativeChatPlainLinkClickBehavior } from './native-chat-link-click-behavior'
import { nativeChatLinkPlainClick } from '../../../../../../shared/native-chat/settings/native-chat-appearance-settings'
import { useNativeChatFileLinkClick } from './use-native-chat-file-link-click'
import { accountShortName, useNativeChatClaudeIdentity } from '../../native-chat-account-usage'
import { projectDefaultClaudeAccount } from '@/lib/project-default-claude-identity'

export type NativeChatLinkActions = {
  onLinkClick: CommentMarkdownLinkClickHandler | undefined
  linkActionRequest: LinkActionRequest | null
  closeLinkActions: (dismissed?: LinkActionRequest) => void
}

/** Match terminal destination popovers: files open in Orca/default app, HTTP(S) links in a browser. */
export function useNativeChatLinkActions(
  context: NativeChatFileLinkContext | null,
  rootRef: RefObject<HTMLElement | null>,
  scope: { sessionId: string | null; isVisible: boolean }
): NativeChatLinkActions {
  const [linkActionRequest, setLinkActionRequest] = useState<LinkActionRequest | null>(null)
  const openFileLink = useNativeChatFileLinkClick(context, setLinkActionRequest, rootRef)
  const scopeKey = JSON.stringify([
    context?.worktreeId,
    context?.runtimeEnvironmentId,
    scope.sessionId
  ])
  const [previousScopeKey, setPreviousScopeKey] = useState(scopeKey)
  if (previousScopeKey !== scopeKey || (!scope.isVisible && linkActionRequest !== null)) {
    setPreviousScopeKey(scopeKey)
    setLinkActionRequest(null)
  }
  // Read at click time, like the settings below.
  const identity = useNativeChatClaudeIdentity()
  const identityRef = useRef(identity)
  identityRef.current = identity
  const closeLinkActions = useCallback((dismissed?: LinkActionRequest) => {
    setLinkActionRequest((current) => closeLinkActionRequest(current, dismissed))
  }, [])

  const onLinkClick = useCallback<CommentMarkdownLinkClickHandler>(
    (event, href) => {
      if (!context) {
        return
      }
      const route = routeNativeChatHref(href)
      if (route.kind === 'file') {
        openFileLink?.(event, href)
        return
      }
      if (route.kind !== 'web' || !/^https?:/i.test(route.url)) {
        return
      }
      // Why: a plain click opens the link in Orca's browser, whose tabs take the project's account
      // profile, and Cmd/Ctrl-click in the Chrome profile of the project's default subscription, or
      // the reverse when Settings says so (Paweł, 2026-11-18: "reverse it", then a setting for it). The Chrome profile
      // is the project's, whatever account this chat runs on (Paweł, 2026-11-10: "I always have to
      // open chrome in profile that is default for given project"); a project without one is the
      // owner's own, so a Claude chat there opens Chrome's first profile, never the chat's account
      // (Paweł, 2026-11-10: a personal project's link opened in a client's profile because its
      // chat ran on that client's subscription). Shift and Alt keep Orca's own link actions.
      const projectAccount = projectDefaultClaudeAccount(useAppStore.getState(), context.worktreeId)
      const chromeAccount = projectAccount
        ? { email: projectAccount.email, name: accountShortName(projectAccount.email) }
        : identityRef.current
          ? { email: null, name: null, owner: true }
          : null
      const leftButton = (event.button ?? 0) === 0
      const plain =
        leftButton && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
      const primary = isTerminalLinkDirectActivation(event) && !event.shiftKey
      // Settings → Chat → Link click opens: which of the two the plain click takes.
      const plainOpensChrome =
        nativeChatLinkPlainClick(useAppStore.getState().settings) === 'chrome'
      const chromeClick = plainOpensChrome ? plain : primary
      const orcaClick = plainOpensChrome ? primary : plain
      if (chromeClick && chromeAccount) {
        event.preventDefault()
        void window.api.shell.openUrl(route.url, chromeAccount)
        return
      }
      if (orcaClick) {
        event.preventDefault()
        const routing = resolveNativeChatHttpLinkRouting(useAppStore.getState(), context.worktreeId)
        openNativeChatWebLink(
          route.url,
          { worktreeId: context.worktreeId, sourceTabId: context.sourceTabId, ...routing },
          httpLinkDirectClickDestination(routing.destinations, false)
        )
        return
      }
      // Read at click time: settings and workspace ownership must not re-render the transcript.
      const state = useAppStore.getState()
      const plainClickBehavior = nativeChatPlainLinkClickBehavior(state.settings)
      const anchor = event.currentTarget
      handleNativeChatWebLink(event, route.url, {
        worktreeId: context.worktreeId,
        sourceTabId: context.sourceTabId,
        ...resolveNativeChatHttpLinkRouting(state, context.worktreeId),
        actionsEnabled: plainClickBehavior === 'actions',
        plainClickBehavior,
        restoreFocus: () =>
          (anchor.isConnected ? anchor : rootRef.current)?.focus({ preventScroll: true }),
        request: setLinkActionRequest
      })
    },
    [context, openFileLink, rootRef]
  )

  return {
    onLinkClick: context ? onLinkClick : undefined,
    linkActionRequest,
    closeLinkActions
  }
}
