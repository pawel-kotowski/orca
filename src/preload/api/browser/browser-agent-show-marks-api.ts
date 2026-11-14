import type {
  AgentShowPageClearArgs,
  AgentShowPageEvent,
  AgentShowPageMarkArgs,
  AgentShowPageMarkResult
} from '../../../shared/agent-show/agent-show-page-marks'

/** window.api.browser members behind `orca show ui`: numbered marks drawn over a page's elements. */
export type BrowserAgentShowMarksApi = {
  agentShowMarkPage?: (args: AgentShowPageMarkArgs) => Promise<AgentShowPageMarkResult>
  agentShowClearPageMarks?: (args: AgentShowPageClearArgs) => Promise<void>
  /** A mark's code link was clicked, or a marked page navigated away. */
  onAgentShowPageEvent?: (callback: (event: AgentShowPageEvent) => void) => () => void
}
