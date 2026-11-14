import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import type { z } from 'zod'
import { defineMethod } from '../../core'
import type { OrcaRuntimeService } from '../../../orca-runtime'
import type { AgentShowResult } from '../../../../../shared/agent-show/agent-show-contract'
import type { AgentShowSnapResult } from '../../../../../shared/agent-show/agent-show-window-relay'
import {
  AgentShowRequestParams,
  AgentShowSnapParams
} from '../../../../../shared/rpc-contract/agent-show-params'

async function showInWindow(
  runtime: OrcaRuntimeService,
  params: z.infer<typeof AgentShowRequestParams>
): Promise<AgentShowResult> {
  const window = runtime.agentShowWindow()
  if (!window?.agentShow) {
    throw new Error('renderer_unavailable')
  }
  const { worktree } = await runtime.resolveRuntimeFileTarget(params.worktree)
  return window.agentShow({
    request: params.request,
    context: {
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      ownerTabId: params.ownerTabId,
      focus: params.focus
    }
  })
}

async function snapWindow(
  runtime: OrcaRuntimeService,
  outPath: string | undefined
): Promise<AgentShowSnapResult> {
  const window = runtime.agentShowWindow()
  if (!window?.captureWindowPng) {
    throw new Error('renderer_unavailable')
  }
  if (outPath !== undefined && !isAbsolute(outPath)) {
    throw new Error('invalid_argument: --out must be an absolute path')
  }
  const shot = await window.captureWindowPng()
  const path = outPath ?? join(tmpdir(), `orca-show-${Date.now()}.png`)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, shot.png)
  return { path, width: shot.width, height: shot.height }
}

export const AGENT_SHOW_METHODS = [
  defineMethod({
    name: 'agentShow.request',
    permission: 'workspace',
    params: AgentShowRequestParams,
    handler: async (params, { runtime }) => showInWindow(runtime, params)
  }),
  defineMethod({
    // Captures the window without showing, raising or focusing it.
    name: 'agentShow.snap',
    permission: 'workspace',
    params: AgentShowSnapParams,
    handler: async (params, { runtime }) => snapWindow(runtime, params.outPath)
  })
]
