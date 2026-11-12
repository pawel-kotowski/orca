// local/orca-glass: a CLI agent a host starts with no view chosen (an orchestration worker, the
// first agent of a workspace a worker-start creates, `orca terminal create --command claude`) is
// published as asking for a view, so the desktop that shows it applies "Open CLI agents in Chat UI"
// (Paweł, 2026-11-12: workers on the devbox opened as terminals).
import { beforeEach, describe, expect, it, vi } from 'vitest'

await import('../../orca-runtime-tests/runtime-test-module-registration.spec')
await import('../../orca-runtime-tests/orca-runtime-test-lifecycle.spec')
const { OrcaRuntimeService } = await import('../../orca-runtime')
const { store, TEST_WORKTREE_ID } =
  await import('../../orca-runtime-tests/orca-runtime-test-fixtures.spec')
const { committingSpawn } = await import('../../orca-runtime-tests/bind-first-pane.test-fixture')
const { detectAgentCommandsOnHost } = await import('../../../preflight/agent-command-detection')
const { createExistingWorktreeWorkerTerminal } =
  await import('../../rpc/methods/orchestration/worker/worker-topology')
const { startRuntimeLocalWorktreeTerminals } =
  await import('../../workspaces/startup/runtime-local-worktree-terminal-startup')

type Runtime = InstanceType<typeof OrcaRuntimeService>

beforeEach(() =>
  vi
    .mocked(detectAgentCommandsOnHost)
    .mockReset()
    .mockResolvedValue(new Set(['claude', 'codex']))
)

function headlessHost(): { runtime: Runtime } {
  const runtime = new OrcaRuntimeService({
    ...store,
    getSettings: () => ({ ...store.getSettings(), disabledTuiAgents: [], agentCmdOverrides: {} })
  })
  let next = 0
  runtime.setPtyController({
    spawn: committingSpawn(
      runtime,
      vi.fn(async () => ({ id: `pty-${++next}` }))
    ),
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => null
  })
  return { runtime }
}

async function publishedTerminalTabs(runtime: Runtime) {
  const result = await runtime.listMobileSessionTabs(`id:${TEST_WORKTREE_ID}`)
  return result.tabs.flatMap((tab) => (tab.type === 'terminal' ? [tab] : []))
}

describe('a host-started CLI agent asks the desktop that shows it for its view', () => {
  it('an orchestration worker in an existing workspace (worker-start --worktree <id>)', async () => {
    const { runtime } = headlessHost()
    await createExistingWorktreeWorkerTerminal({
      runtime,
      worktreeId: TEST_WORKTREE_ID,
      agent: 'claude',
      taskId: 'task-1',
      effects: []
    })

    const [tab] = await publishedTerminalTabs(runtime)
    expect(tab).toMatchObject({ launchAgent: 'claude', pendingViewAgent: 'claude' })
    expect(tab).not.toHaveProperty('viewMode')
  })

  it('the first agent of a workspace a worker-start creates (--worktree new-child)', async () => {
    const { runtime } = headlessHost()
    const activate = vi.fn()
    await startRuntimeLocalWorktreeTerminals({
      request: { repo: 'repo', name: 'run-policy-lot-2' } as never,
      repo: { id: 'repo' } as never,
      worktree: { id: TEST_WORKTREE_ID, path: '/tmp/worktree-a' } as never,
      startup: { command: 'claude', launchSource: 'orchestration' } as never,
      createdWithAgent: 'claude',
      ports: {
        canSpawn: true,
        createTerminal: (selector, options) => runtime.createTerminal(selector, options),
        pasteDraft: vi.fn(),
        sendFollowup: vi.fn(),
        provision: vi.fn(async () => ({ setupSpawned: false, setupTerminalHandle: null })),
        activate
      }
    })

    const [tab] = await publishedTerminalTabs(runtime)
    expect(tab).toMatchObject({ launchAgent: 'claude', pendingViewAgent: 'claude' })
    expect(tab).not.toHaveProperty('viewMode')
  })

  it.each([
    ['~/.agents/bin/claude-as mos --model opus', 'claude'],
    ['codex --yolo', 'codex']
  ])('orca terminal create --command %s', async (command, agent) => {
    const { runtime } = headlessHost()
    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { command })

    const [tab] = await publishedTerminalTabs(runtime)
    expect(tab?.pendingViewAgent).toBe(agent)
  })

  it.each([
    ['a plain shell', {}],
    ['a shell command', { command: 'npm run dev' }],
    ['a headless one-shot', { command: "claude --print 'hi'" }],
    [
      'an agent whose view was chosen',
      { command: 'claude', launchAgent: 'claude', viewMode: 'chat' }
    ]
  ] as const)('not %s', async (_name, options) => {
    const { runtime } = headlessHost()
    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { ...options })

    const [tab] = await publishedTerminalTabs(runtime)
    expect(tab).toBeDefined()
    expect(tab).not.toHaveProperty('pendingViewAgent')
  })

  it('stops asking once a desktop sets the view', async () => {
    const { runtime } = headlessHost()
    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { command: 'claude' })
    const [before] = await publishedTerminalTabs(runtime)

    await runtime.setMobileSessionTabProps(`id:${TEST_WORKTREE_ID}`, {
      tabId: before!.parentTabId,
      viewMode: 'chat'
    })

    const [after] = await publishedTerminalTabs(runtime)
    expect(after).toMatchObject({ viewMode: 'chat' })
    expect(after).not.toHaveProperty('pendingViewAgent')
  })

  it('names a bare agent command to the local window, which has no launch agent to go by', async () => {
    const { runtime } = headlessHost()
    const revealTerminalSession = vi.fn(
      async (_worktreeId: string, _opts: Record<string, unknown>) => ({ tabId: 'tab-local' })
    )
    runtime.setNotifier({ revealTerminalSession } as never)

    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, { command: 'claude-as personal' })
    await runtime.createTerminal(`id:${TEST_WORKTREE_ID}`, {
      command: 'claude',
      launchAgent: 'claude'
    })

    expect(revealTerminalSession.mock.calls[0]?.[1]).toMatchObject({ commandAgent: 'claude' })
    expect(revealTerminalSession.mock.calls[1]?.[1]).toMatchObject({ launchAgent: 'claude' })
    expect(revealTerminalSession.mock.calls[1]?.[1]).not.toHaveProperty('commandAgent')
  })
})
