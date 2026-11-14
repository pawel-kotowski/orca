import { randomBytes } from 'node:crypto'
import { ipcMain, type WebContents } from 'electron'
import {
  AGENT_SHOW_PAGE_CLEAR_CHANNEL,
  AGENT_SHOW_PAGE_EVENT_CHANNEL,
  AGENT_SHOW_PAGE_MARK_CHANNEL,
  type AgentShowPageClearArgs,
  type AgentShowPageEvent,
  type AgentShowPageMarkArgs,
  type AgentShowPageMarkResult
} from '../../../shared/agent-show/agent-show-page-marks'
import { browserManager } from '../guest-lifecycle/manager/browser-manager'
import { isTrustedBrowserRenderer } from '../../ipc/browser/browser-renderer-trust'
import { mainProcessState } from '../../startup/main-process-state'
import type { AgentShowPageMarkSpec } from './agent-show-page-overlay-script'
import {
  agentShowMarkByLocatorScript,
  agentShowMarkElementFunction,
  agentShowRemoveMarksScript,
  type AgentShowLocatorOutcome
} from './agent-show-page-scripts'

type MarkedPage = {
  guest: WebContents
  /** Unguessable per page, so page scripts cannot easily forge clicks on another mark's code. */
  signal: string
  keys: Set<string>
  detach: () => void
}

const markedPages = new Map<string, MarkedPage>()

function send(renderer: WebContents, event: AgentShowPageEvent): void {
  if (!renderer.isDestroyed()) {
    renderer.send(AGENT_SHOW_PAGE_EVENT_CHANNEL, event)
  }
}

function forgetPage(browserPageId: string): void {
  markedPages.get(browserPageId)?.detach()
  markedPages.delete(browserPageId)
}

// Listeners exist only while a page carries marks.
function trackPage(browserPageId: string, guest: WebContents, renderer: WebContents): MarkedPage {
  const existing = markedPages.get(browserPageId)
  if (existing && existing.guest === guest) {
    return existing
  }
  forgetPage(browserPageId)
  const signal = `__orca_agent_show__:${randomBytes(12).toString('hex')}:`
  const reset = (): void => {
    forgetPage(browserPageId)
    send(renderer, { kind: 'reset', browserPageId })
  }
  const onConsole = (details: { message: string }): void => {
    const key = details.message.startsWith(signal) ? details.message.slice(signal.length) : null
    if (key !== null && markedPages.get(browserPageId)?.keys.has(key)) {
      send(renderer, { kind: 'open-code', browserPageId, key })
    }
  }
  // In-place URL updates (hash, pushState) keep the document and its marks.
  const onNavigation = (
    _event: unknown,
    _url: unknown,
    isInPlace: boolean,
    isMainFrame: boolean
  ): void => {
    if (isMainFrame && !isInPlace) {
      reset()
    }
  }
  guest.on('console-message', onConsole)
  guest.on('did-start-navigation', onNavigation)
  guest.on('destroyed', reset)
  const page: MarkedPage = {
    guest,
    signal,
    keys: new Set(),
    detach: () => {
      if (!guest.isDestroyed()) {
        guest.off('console-message', onConsole)
        guest.off('did-start-navigation', onNavigation)
        guest.off('destroyed', reset)
      }
    }
  }
  markedPages.set(browserPageId, page)
  return page
}

function describeTarget(target: AgentShowPageMarkArgs['target']): string {
  return target.ref
    ? `ref ${target.ref}`
    : target.selector
      ? `selector ${JSON.stringify(target.selector)}`
      : `text ${JSON.stringify(target.text ?? '')}`
}

async function markPage(
  guest: WebContents,
  args: AgentShowPageMarkArgs,
  spec: AgentShowPageMarkSpec
): Promise<AgentShowLocatorOutcome> {
  if (!args.target.ref) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the script built by agentShowMarkByLocatorScript returns this shape.
    return (await guest.executeJavaScript(
      agentShowMarkByLocatorScript(args.target, spec)
    )) as AgentShowLocatorOutcome
  }
  const bridge = mainProcessState.agentBrowserBridge
  if (!bridge) {
    return { matches: 0, visibleMatches: 0, error: 'browser automation is not running' }
  }
  try {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: agentShowMarkElementFunction returns { inViewport }.
    const shown = (await bridge.callOnElement(
      args.target.ref,
      agentShowMarkElementFunction(),
      [spec],
      args.worktreeId,
      args.browserPageId
    )) as { inViewport: boolean }
    return { matches: 1, visibleMatches: shown.inViewport ? 1 : 0, inViewport: shown.inViewport }
  } catch (error) {
    return {
      matches: 0,
      visibleMatches: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

async function clearPage(guest: WebContents, keys: string[] | null): Promise<void> {
  const script = agentShowRemoveMarksScript(keys)
  // Ref marks can live in a subframe, so every frame drops its own.
  await Promise.all(
    guest.mainFrame.framesInSubtree.map((frame) =>
      frame.executeJavaScript(script).catch(() => undefined)
    )
  )
}

export function registerAgentShowPageMarkHandlers(): void {
  ipcMain.removeHandler(AGENT_SHOW_PAGE_MARK_CHANNEL)
  ipcMain.removeHandler(AGENT_SHOW_PAGE_CLEAR_CHANNEL)

  ipcMain.handle(
    AGENT_SHOW_PAGE_MARK_CHANNEL,
    async (event, args: AgentShowPageMarkArgs): Promise<AgentShowPageMarkResult> => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return { ok: false, code: 'not_authorized', message: 'Not authorized' }
      }
      const guest = browserManager.getAuthorizedGuest(args.browserPageId, event.sender.id)
      if (!guest) {
        return {
          ok: false,
          code: 'page_unavailable',
          message: `Browser page ${args.browserPageId} is not loaded`
        }
      }
      const page = trackPage(args.browserPageId, guest, event.sender)
      const spec: AgentShowPageMarkSpec = {
        key: args.key,
        label: args.label,
        note: args.note,
        codeLabel: args.codeLabel,
        signal: page.signal
      }
      const outcome = await markPage(guest, args, spec).catch(
        (error: unknown): AgentShowLocatorOutcome => ({
          matches: 0,
          visibleMatches: 0,
          error: error instanceof Error ? error.message : String(error)
        })
      )
      if (outcome.matches === 0) {
        if (page.keys.size === 0) {
          forgetPage(args.browserPageId)
        }
        return {
          ok: false,
          code: 'target_not_found',
          message: `Nothing matched ${describeTarget(args.target)} on ${guest.getURL()}${outcome.error ? ` (${outcome.error})` : ''}`
        }
      }
      page.keys.add(args.key)
      return {
        ok: true,
        url: guest.getURL(),
        matches: outcome.matches,
        visibleMatches: outcome.visibleMatches,
        inViewport: outcome.inViewport === true
      }
    }
  )

  ipcMain.handle(
    AGENT_SHOW_PAGE_CLEAR_CHANNEL,
    async (event, args: AgentShowPageClearArgs): Promise<void> => {
      if (!isTrustedBrowserRenderer(event.sender)) {
        return
      }
      const page = markedPages.get(args.browserPageId)
      const guest = browserManager.getAuthorizedGuest(args.browserPageId, event.sender.id)
      if (!page || !guest || page.guest !== guest) {
        forgetPage(args.browserPageId)
        return
      }
      for (const key of args.keys) {
        page.keys.delete(key)
      }
      await clearPage(guest, page.keys.size === 0 ? null : args.keys)
      if (page.keys.size === 0) {
        forgetPage(args.browserPageId)
      }
    }
  )
}
