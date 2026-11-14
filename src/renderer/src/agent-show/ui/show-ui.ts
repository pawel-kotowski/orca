import type {
  AgentShowContext,
  AgentShowHandler,
  AgentShowState
} from '../../../../shared/agent-show/agent-show-contract'
import { agentShowNotReady } from '../agent-show-not-ready'

// Owned by the ui lot: numbered highlights on browser pages, linked to code.
export const showUi: AgentShowHandler<'ui'> = () => agentShowNotReady('ui')
export async function clearUiMarks(_context: AgentShowContext): Promise<void> {}
export function uiStateFor(_context: AgentShowContext): AgentShowState['browser'] {
  return []
}
