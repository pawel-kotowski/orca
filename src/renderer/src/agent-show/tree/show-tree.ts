import type {
  AgentShowContext,
  AgentShowHandler
} from '../../../../shared/agent-show/agent-show-contract'
import { agentShowNotReady } from '../agent-show-not-ready'

// Owned by the tree lot: reveal, expand, labelled highlights, dim the rest.
export const showTree: AgentShowHandler<'tree'> = () => agentShowNotReady('tree')
export function clearTreeMarks(_context: AgentShowContext): void {}
export function treeMarksFor(_context: AgentShowContext): string[] {
  return []
}
