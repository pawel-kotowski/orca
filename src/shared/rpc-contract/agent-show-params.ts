import { z } from 'zod'
import { AgentShowRequest } from '../agent-show/agent-show-contract'
import { WorktreeSelector } from './files-target-params'

export const AgentShowRequestParams = WorktreeSelector.extend({
  request: AgentShowRequest,
  ownerTabId: z.string().min(1).nullable(),
  focus: z.boolean()
})

export const AgentShowSnapParams = z.object({
  outPath: z.string().min(1).optional()
})

export const AgentShowTourLoadParams = WorktreeSelector.extend({
  /** The tour file's path, for its name and identity; `text` is what is read. */
  file: z.string().min(1),
  text: z.string().max(400_000)
})

export const AgentShowTourStampParams = WorktreeSelector.extend({
  text: z.string().max(400_000)
})

export const AgentShowToursParams = WorktreeSelector

export const AgentShowTourSnapshotParams = WorktreeSelector.extend({
  commit: z.string().regex(/^[0-9a-f]{7,64}$/i),
  path: z.string().min(1)
})
