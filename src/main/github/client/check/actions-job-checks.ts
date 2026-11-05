import type { PRCheckDetail } from '../../../../shared/github/check-types'
import { extractExecError } from '../../../git/exec-error'
import { ghExecFileAsync } from '../../gh-utils'
import type { GitHubApiRepository } from '../../github-api-repository'
import { mapCheckRunRESTConclusion } from '../../mappers'
import { noteRepositoryRateLimitSpend } from '../../rate-limit'
import type { GhExecOptions } from './../github-exec-scope'

// Why: fine-grained personal access tokens cannot be granted the Checks permission, so
// GitHub refuses every check-run read with this message while Actions reads still work.
export function isCheckRunsPermissionDenied(err: unknown): boolean {
  const { stderr, stdout } = extractExecError(err)
  const message = `${stderr}\n${stdout}\n${err instanceof Error ? err.message : ''}`
  return message.toLowerCase().includes('resource not accessible by personal access token')
}

type ActionsRun = { id?: number | null; name?: string | null }
type ActionsJob = {
  id?: number | null
  name?: string | null
  status?: string | null
  conclusion?: string | null
  html_url?: string | null
  run_id?: number | null
}

function mapActionsJobStatus(status: string): PRCheckDetail['status'] {
  const s = status.toLowerCase()
  if (s === 'in_progress') {
    return 'in_progress'
  }
  return s === 'completed' ? 'completed' : 'queued'
}

/** The head commit's GitHub Actions jobs, as check rows. A job's id is its check run's id. */
export async function readActionsJobChecks(
  ownerRepo: GitHubApiRepository,
  headSha: string,
  ghOptions: GhExecOptions,
  cacheArgs: string[]
): Promise<PRCheckDetail[]> {
  const repoPath = `repos/${ownerRepo.owner}/${ownerRepo.repo}`
  const { stdout } = await ghExecFileAsync(
    [
      'api',
      ...cacheArgs,
      `${repoPath}/actions/runs?head_sha=${encodeURIComponent(headSha)}&per_page=100`
    ],
    ghOptions
  )
  noteRepositoryRateLimitSpend(ownerRepo, 'core', 1, ghOptions)
  const runs = ((JSON.parse(stdout) as { workflow_runs?: ActionsRun[] }).workflow_runs ?? [])
    .map((run) => run.id)
    .filter((id): id is number => typeof id === 'number')

  const checks: PRCheckDetail[] = []
  for (const runId of runs) {
    const jobsResult = await ghExecFileAsync(
      ['api', ...cacheArgs, `${repoPath}/actions/runs/${runId}/jobs?per_page=100`],
      ghOptions
    )
    noteRepositoryRateLimitSpend(ownerRepo, 'core', 1, ghOptions)
    const jobs = (JSON.parse(jobsResult.stdout) as { jobs?: ActionsJob[] }).jobs ?? []
    for (const job of jobs) {
      if (!job.name) {
        continue
      }
      const status = mapActionsJobStatus(job.status ?? '')
      checks.push({
        name: job.name,
        status,
        conclusion: mapCheckRunRESTConclusion(status, job.conclusion ?? null),
        url: job.html_url ?? null,
        ...(typeof job.id === 'number' ? { checkRunId: job.id } : {}),
        workflowRunId: typeof job.run_id === 'number' ? job.run_id : runId
      })
    }
  }
  return checks
}
