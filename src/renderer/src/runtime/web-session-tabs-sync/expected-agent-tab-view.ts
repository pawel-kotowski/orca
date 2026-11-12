/**
 * A remote workspace whose first agent tab should open in its Chat UI (Paweł, 2026-11-09: new
 * agents on the devbox and robo-pc-107 opened as terminals). Its host makes that tab while the
 * workspace is created, so the laptop's own tab creation, which applies "Open CLI agents in Chat
 * UI", never runs; the mirror applies it to the first agent tab it builds for the workspace.
 */
import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'

type Expected = { until: number; tabId?: string; told?: true }

const EXPECT_MS = 120_000
const expected = new Map<string, Expected>()

export function expectAgentTabChatView(worktreeId: string, now = Date.now()): void {
  expected.set(worktreeId, { until: now + EXPECT_MS })
}

/**
 * 'chat' for the workspace's first agent tab, on every rebuild until the note expires (a build
 * can be discarded, so the claim is not spent on the first one); `tell` is true once, for
 * telling the host.
 */
export function claimExpectedAgentTabView(
  worktreeId: string,
  localTabId: string,
  launchAgent: unknown,
  now = Date.now()
): { viewMode: 'chat'; tell: boolean } | null {
  const entry = expected.get(worktreeId)
  if (!entry) {
    return null
  }
  if (entry.until < now) {
    expected.delete(worktreeId)
    return null
  }
  if (!launchAgent) {
    return null
  }
  entry.tabId ??= localTabId
  if (entry.tabId !== localTabId) {
    return null
  }
  const tell = entry.told !== true
  entry.told = true
  return { viewMode: 'chat', tell }
}

/**
 * How this desktop opens a CLI agent its host started with no view chosen (Paweł, 2026-11-12:
 * orchestration workers started on the devbox opened as terminals): the view "Open CLI agents in
 * Chat UI" picks, or null while it cannot tell yet (settings not loaded). Set by the mirror's owner,
 * which reads the store; the mirror itself stays store-free.
 */
type PendingAgentTabViewDefault = (
  worktreeId: string,
  agent: TuiAgent
) => 'chat' | 'terminal' | null

let pendingViewDefault: PendingAgentTabViewDefault | null = null
const toldPendingViews = new Set<string>()

export function setPendingAgentTabViewDefault(resolve: PendingAgentTabViewDefault | null): void {
  pendingViewDefault = resolve
}

/**
 * The view for a mirrored tab whose host still asks for one (`pendingViewAgent`); `tell` is true
 * once per tab, for setting it on the host, after which the host publishes it as `viewMode`.
 */
export function choosePendingAgentTabView(
  worktreeId: string,
  localTabId: string,
  agent: TuiAgent
): { viewMode: 'chat' | 'terminal'; tell: boolean } | null {
  const viewMode = pendingViewDefault?.(worktreeId, agent) ?? null
  if (!viewMode) {
    return null
  }
  const key = `${worktreeId}\u0000${localTabId}`
  const tell = !toldPendingViews.has(key)
  toldPendingViews.add(key)
  return { viewMode, tell }
}

export function resetExpectedAgentTabViewsForTests(): void {
  expected.clear()
  toldPendingViews.clear()
  pendingViewDefault = null
}
