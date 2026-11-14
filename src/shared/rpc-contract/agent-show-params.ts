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
