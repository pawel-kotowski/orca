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
  AgentShowSnapParams,
  AgentShowTourLoadParams,
  AgentShowTourSnapshotParams,
  AgentShowTourStampParams,
  AgentShowToursParams
} from '../../../../../shared/rpc-contract/agent-show-params'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../../shared/execution-host'
import { loadTour, tourPathInWorktree } from '../../../../agent-show/tours/tour-load'
import { listWorktreeTours } from '../../../../agent-show/tours/tour-library'
import { tourStampInfo } from '../../../../agent-show/tours/tour-stamp-info'
import { writeFileAtCommit } from '../../../../agent-show/tours/tour-git'

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

/** The worktree's path, and whether its files are on this machine for git and the file checks. */
async function tourWorktree(
  runtime: OrcaRuntimeService,
  selector: string
): Promise<{ path: string; local: boolean }> {
  const { worktree, executionHostId } = await runtime.resolveRuntimeFileTarget(selector)
  return { path: worktree.path, local: executionHostId === LOCAL_EXECUTION_HOST_ID }
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
  }),
  defineMethod({
    // Compiles a tour and compares its steps with the stamped commit; the CLI sends the text it read.
    name: 'agentShow.tourLoad',
    permission: 'workspace',
    params: AgentShowTourLoadParams,
    handler: async (params, { runtime }) => {
      const worktree = await tourWorktree(runtime, params.worktree)
      return loadTour({
        worktreePath: worktree.path,
        local: worktree.local,
        file: params.file,
        text: params.text
      })
    }
  }),
  defineMethod({
    name: 'agentShow.tourStamp',
    permission: 'workspace',
    params: AgentShowTourStampParams,
    handler: async (params, { runtime }) => {
      const worktree = await tourWorktree(runtime, params.worktree)
      if (!worktree.local) {
        throw new Error('invalid_argument: stamping needs the worktree on this machine')
      }
      return tourStampInfo(worktree.path, params.text)
    }
  }),
  defineMethod({
    // The Tours panel's list: the worktree's docs/tours, each checked against today's code.
    name: 'agentShow.tours',
    permission: 'workspace',
    params: AgentShowToursParams,
    handler: async (params, { runtime }) => {
      const worktree = await tourWorktree(runtime, params.worktree)
      return listWorktreeTours(worktree.path, worktree.local)
    }
  }),
  defineMethod({
    // A stale step's file as it was at the stamped commit, for "as it was".
    name: 'agentShow.tourSnapshot',
    permission: 'workspace',
    params: AgentShowTourSnapshotParams,
    handler: async (params, { runtime }) => {
      const worktree = await tourWorktree(runtime, params.worktree)
      const path = tourPathInWorktree(worktree.path, params.path)
      if (path.split('/').includes('..')) {
        throw new Error('invalid_argument: the path must stay inside the worktree')
      }
      const filePath = await writeFileAtCommit(worktree.path, params.commit, path)
      if (!filePath) {
        throw new Error(`not_found: ${path} is not a text file in ${params.commit.slice(0, 7)}`)
      }
      return { filePath }
    }
  })
]
