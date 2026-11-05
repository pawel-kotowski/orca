import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ghExecFileAsyncMock } = vi.hoisted(() => ({ ghExecFileAsyncMock: vi.fn() }))

vi.mock('../../gh-utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ghExecFileAsync: ghExecFileAsyncMock,
  acquire: vi.fn(),
  release: vi.fn()
}))
vi.mock('../../rate-limit', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  noteRepositoryRateLimitSpend: vi.fn()
}))
vi.mock('./../lookup/pr-lookup-rate-limit', () => ({ assertRateLimitBudget: vi.fn() }))

import { getPRChecksViaRestFallback } from './get-pr-checks'

const repo = { owner: 'acme', repo: 'widgets', host: 'github.com' }
const options = { cwd: '/repo-root' }

function forbidden(path: string): Error {
  return Object.assign(new Error(`Command failed: gh api ${path}`), {
    stderr: 'gh: Resource not accessible by personal access token (HTTP 403)\n',
    stdout: '{"message":"Resource not accessible by personal access token","status":"403"}'
  })
}

function reply(body: unknown): { stdout: string; stderr: string } {
  return { stdout: JSON.stringify(body), stderr: '' }
}

beforeEach(() => {
  ghExecFileAsyncMock.mockReset()
})

describe('checks for a token without the Checks permission', () => {
  it('lists the head commit Actions jobs when check runs are refused', async () => {
    ghExecFileAsyncMock.mockImplementation(async (args: string[]) => {
      const path = args.at(-1) ?? ''
      if (path.includes('/check-runs') || path.includes('/check-suites')) {
        throw forbidden(path)
      }
      if (path.includes('/actions/runs?head_sha=sha-1')) {
        return reply({ workflow_runs: [{ id: 7, name: 'check' }] })
      }
      if (path.endsWith('/actions/runs/7/jobs?per_page=100')) {
        return reply({
          jobs: [
            {
              id: 71,
              run_id: 7,
              name: 'pytest',
              status: 'completed',
              conclusion: 'success',
              html_url: 'https://github.com/acme/widgets/actions/runs/7/job/71'
            },
            {
              id: 72,
              run_id: 7,
              name: 'bench',
              status: 'completed',
              conclusion: 'skipped',
              html_url: null
            },
            {
              id: 73,
              run_id: 7,
              name: 'compose',
              status: 'waiting',
              conclusion: null,
              html_url: null
            }
          ]
        })
      }
      if (path.includes('/status?')) {
        return reply({ statuses: [{ context: 'ci/jenkins', state: 'success', target_url: null }] })
      }
      throw new Error(`unexpected ${path}`)
    })

    const checks = await getPRChecksViaRestFallback(repo, 'sha-1', options)

    expect(checks).toEqual([
      {
        name: 'pytest',
        status: 'completed',
        conclusion: 'success',
        url: 'https://github.com/acme/widgets/actions/runs/7/job/71',
        checkRunId: 71,
        workflowRunId: 7
      },
      {
        name: 'bench',
        status: 'completed',
        conclusion: 'skipped',
        url: null,
        checkRunId: 72,
        workflowRunId: 7
      },
      {
        name: 'compose',
        status: 'queued',
        conclusion: 'pending',
        url: null,
        checkRunId: 73,
        workflowRunId: 7
      },
      { name: 'ci/jenkins', status: 'completed', conclusion: 'success', url: null }
    ])
  })

  it('still gives up on other check-run failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    ghExecFileAsyncMock.mockRejectedValueOnce(new Error('network down'))

    await expect(getPRChecksViaRestFallback(repo, 'sha-1', options)).resolves.toBeNull()
    expect(ghExecFileAsyncMock).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
