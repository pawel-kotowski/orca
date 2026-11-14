import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowVisibleEditor
} from '../../../../shared/agent-show/agent-show-contract'
import { agentShowNotReady } from '../agent-show-not-ready'

// Owned by the code lot: placement, range reveal, persistent highlights and note cards.
export const showCode: AgentShowHandler<'code'> = () => agentShowNotReady('code')
export const showFile: AgentShowHandler<'file'> = () => agentShowNotReady('file')
export function clearCodeMarks(_context: AgentShowContext): void {}
export function codeStateFor(_context: AgentShowContext): AgentShowVisibleEditor[] {
  return []
}
