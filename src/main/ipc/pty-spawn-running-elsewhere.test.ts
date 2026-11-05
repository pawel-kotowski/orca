import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { spawnMock } from './pty/pty-ipc-mock-registry'
import { posixOnlyIt } from './pty/pty-ipc-test-constants'
import { setupPtyIpcSuite } from './pty/pty-ipc-test-harness'
import { POSIX_SHELL_STARTUP_COMMAND_ENV } from '../pty/shell-startup/posix-shell-startup-command'
import { registerPtyHandlers } from './pty/register-handlers'
import { OrcaRuntimeService } from '../runtime/orca-runtime'
import { AgentSessionRecordStore } from '../runtime/agent-session/records/agent-session-record-store'

vi.mock('electron', () => import('./pty/pty-ipc-mock-registry').then((m) => m.electronModuleMock()))
vi.mock('fs', () => import('./pty/pty-ipc-mock-registry').then((m) => m.fsModuleMock()))
vi.mock('node-pty', () => import('./pty/pty-ipc-mock-registry').then((m) => m.nodePtyModuleMock()))
vi.mock('node:child_process', async (importOriginal) =>
  (await import('./pty/pty-ipc-mock-registry')).childProcessModuleMock(await importOriginal())
)
vi.mock('../agent-hooks/server', () =>
  import('./pty/pty-ipc-mock-registry').then((m) => m.agentHookServerModuleMock())
)

// Paweł, 2026-11-05: in daemon-fallback mode a floating pane whose saved terminal
// (`global-floating-terminal@@…`) lives on in the unreachable daemon reopened as a fresh in-process
// shell under that same id, while the Claude in the daemon terminal still ran the conversation.
// The window's restore sends the resume with that reattach request, and main must judge it there:
// the in-process provider never reports `coldRestore`, so no later admission sees this shell.
describe('a restore that the in-process provider starts fresh under the requested id', () => {
  const { handlers, mainWindow, createMockProc } = setupPtyIpcSuite()
  const SAVED_PTY_ID = 'global-floating-terminal@@ebcf84af'
  const SESSION = 'running-elsewhere-test-session'
  const LIVE_PID = process.ppid
  let configDir: string
  let previousConfigDir: string | undefined

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'claude-config-'))
    await mkdir(join(configDir, 'sessions'))
    previousConfigDir = process.env.CLAUDE_CONFIG_DIR
    // Why: the holder lookup reads `$CLAUDE_CONFIG_DIR/sessions`, so the test owns that record dir.
    process.env.CLAUDE_CONFIG_DIR = configDir
    const runtime = new OrcaRuntimeService()
    vi.spyOn(runtime, 'openAgentSessionRecordStore').mockImplementation(async () => {
      const store: AgentSessionRecordStore = Object.create(AgentSessionRecordStore.prototype)
      store.listConversations = () => []
      store.getVisibleSessionTabIndex = () => ({ present: true, sessionIds: [] })
      return store
    })
    registerPtyHandlers(mainWindow, runtime)
  })

  afterEach(async () => {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    await rm(configDir, { recursive: true, force: true })
  })

  async function liveClaudeRuns(sessionId: string): Promise<void> {
    await writeFile(
      join(configDir, 'sessions', `${LIVE_PID}.json`),
      JSON.stringify({ pid: LIVE_PID, sessionId, kind: 'interactive' })
    )
  }

  /** The window's reattach of a restored agent pane, carrying the resume it would start. */
  async function restore(): Promise<{ result: Record<string, unknown>; startup: string }> {
    const before = spawnMock.mock.calls.length
    const proc = createMockProc().proc
    spawnMock.mockReturnValue(proc)
    vi.useFakeTimers()
    const pending = handlers.get('pty:spawn')!(null, {
      cols: 80,
      rows: 24,
      cwd: '/tmp',
      worktreeId: 'global-floating-terminal',
      tabId: 'tab-floating',
      leafId: '11111111-1111-4111-8111-111111111111',
      sessionId: SAVED_PTY_ID,
      command: `claude --resume '${SESSION}'`,
      launchAgent: 'claude',
      resumeProviderSession: { key: 'session_id', id: SESSION },
      resumeOrigin: 'saved'
    })
    try {
      const result = await pending
      // Let the shell-ready startup delivery, which runs on timers, write what it would type.
      for (let flush = 0; flush < 3; flush += 1) {
        await Promise.resolve()
        vi.runAllTimers()
      }
      const spawned = spawnMock.mock.calls.length > before
      const env: Record<string, string> = spawned ? spawnMock.mock.calls.at(-1)![2].env : {}
      const typed = proc.write.mock.calls.map((call: unknown[]) => String(call[0]))
      return {
        result: typeof result === 'object' && result !== null ? { ...result } : {},
        startup: spawned
          ? [env[POSIX_SHELL_STARTUP_COMMAND_ENV] ?? '', ...typed].join('\n')
          : '(no new process)'
      }
    } finally {
      vi.useRealTimers()
    }
  }

  posixOnlyIt('starts a plain shell when a live Claude already runs the conversation', async () => {
    await liveClaudeRuns(SESSION)
    const { result, startup } = await restore()
    expect(result).toMatchObject({
      id: SAVED_PTY_ID,
      agentResumeRefused: 'running-elsewhere',
      agentResumeUnavailable: true,
      savedResumeDecision: { agent: 'claude', verdict: 'running-elsewhere' }
    })
    expect(result.isReattach).toBeFalsy()
    expect(startup).not.toContain(SESSION)
  })

  posixOnlyIt('resumes when no live process runs the conversation', async () => {
    await liveClaudeRuns('some-other-session')
    const { result, startup } = await restore()
    expect(result).toMatchObject({
      id: SAVED_PTY_ID,
      savedResumeDecision: { agent: 'claude', verdict: 'admitted' }
    })
    expect(result.agentResumeRefused).toBeUndefined()
    expect(startup).toContain(`--resume '${SESSION}'`)
  })

  posixOnlyIt('leaves a real reattach to its own terminal untouched', async () => {
    await restore()
    // The terminal now exists in this provider, and its own Claude runs the conversation: a
    // reattach joins it and reports its original launch, never a refusal against itself.
    await liveClaudeRuns(SESSION)
    const { result, startup } = await restore()
    expect(result).toMatchObject({
      id: SAVED_PTY_ID,
      isReattach: true,
      savedResumeDecision: { verdict: 'admitted' }
    })
    expect(result.agentResumeRefused).toBeUndefined()
    expect(startup).toBe('(no new process)')
  })
})
