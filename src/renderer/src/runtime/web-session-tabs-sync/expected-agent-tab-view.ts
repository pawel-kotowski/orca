/**
 * A remote workspace whose first agent tab should open in its Chat UI (Paweł, 2026-11-09: new
 * agents on the devbox and robo-pc-107 opened as terminals). Its host makes that tab while the
 * workspace is created, so the laptop's own tab creation, which applies "Open CLI agents in Chat
 * UI", never runs; the mirror applies it to the first agent tab it builds for the workspace.
 */
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

export function resetExpectedAgentTabViewsForTests(): void {
  expected.clear()
}
