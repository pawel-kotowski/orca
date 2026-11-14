import type { AgentShowPageTarget } from '../../../shared/agent-show/agent-show-page-marks'
import {
  installAgentShowMark,
  removeAgentShowMarks,
  type AgentShowPageMarkSpec
} from './agent-show-page-overlay-script'
import { findAgentShowTarget } from './agent-show-page-target-script'

export type AgentShowLocatorOutcome = {
  matches: number
  visibleMatches: number
  inViewport?: boolean
  error?: string
}

/** Finds the selector or text target in the main frame and marks it. */
export function agentShowMarkByLocatorScript(
  target: Pick<AgentShowPageTarget, 'selector' | 'text'>,
  spec: AgentShowPageMarkSpec
): string {
  return `(() => {
  const find = ${findAgentShowTarget.toString()};
  const install = ${installAgentShowMark.toString()};
  const found = find(document, ${JSON.stringify(target)});
  if (found.error || !found.element) {
    return { matches: 0, visibleMatches: 0, error: found.error };
  }
  const shown = install(found.element, ${JSON.stringify(spec)});
  return { matches: found.matches, visibleMatches: found.visibleMatches, inViewport: shown.inViewport };
})()`
}

/** `this` is the element agent-browser resolved from a snapshot ref, in whichever frame owns it. */
export function agentShowMarkElementFunction(): string {
  return `function (spec) { return (${installAgentShowMark.toString()})(this, spec); }`
}

export function agentShowRemoveMarksScript(keys: string[] | null): string {
  return `(${removeAgentShowMarks.toString()})(window, ${JSON.stringify(keys)})`
}
