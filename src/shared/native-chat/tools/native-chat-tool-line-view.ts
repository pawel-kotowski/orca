import { agentJournalToolCallLifecycle } from '../../agent-journal-tool-call-lifecycle'
import { nativeChatToolArguments, type NativeChatToolArgument } from './native-chat-tool-code-parts'
import { nativeChatToolCategory } from './native-chat-tool-icon'
import {
  isToolCallBlock,
  type NativeChatToolCallBlock,
  type NativeChatToolResultBlock
} from '../native-chat-types'
import { diffFromToolCall } from './native-chat-diff'
import { toolWebSearchResults, type NativeChatWebSearchResult } from './native-chat-tool-identity'
import {
  nativeChatToolLineLabel,
  type NativeChatToolLineLabel
} from './native-chat-tool-line-label'

export type NativeChatToolLineView = {
  call: NativeChatToolCallBlock | undefined
  label: NativeChatToolLineLabel | null
  /** What the row opens to: a call's paired result, or a lone result itself. */
  body: NativeChatToolResultBlock | undefined
  /** A lone result's first line, its row's only words. */
  resultPreview: string
  failed: boolean
  /** Link-safe hits only, so unsafe-only results do not open an empty panel. */
  results: NativeChatWebSearchResult[]
  hasDetail: boolean
  /** A tool's arguments when one of them is code (an MCP `python_exec`'s `code`); else empty. */
  toolArguments: NativeChatToolArgument[]
}

const NO_SEARCH_RESULTS: NativeChatWebSearchResult[] = []
const NO_TOOL_ARGUMENTS: NativeChatToolArgument[] = []

export function nativeChatToolLineView(
  block: NativeChatToolCallBlock | NativeChatToolResultBlock,
  result?: NativeChatToolResultBlock
): NativeChatToolLineView {
  const call = isToolCallBlock(block) ? block : undefined
  const label = call ? nativeChatToolLineLabel(call, result) : null
  const body = call ? result : block.type === 'tool-result' ? block : undefined
  // A call the reader stopped was cut short, not failed.
  const lifecycle = call ? agentJournalToolCallLifecycle(call) : null
  const failed = lifecycle === 'failed' || (lifecycle !== 'interrupted' && result?.isError === true)
  const results = call ? toolWebSearchResults(call.webSearchResults) : NO_SEARCH_RESULTS
  // An edit that has not landed has no output yet, but the change it proposes is worth opening.
  // Why: a shell command already shows its own text; other tools that take code show it colored.
  const parsedArguments =
    call &&
    label?.fullCommand === null &&
    (label.command || nativeChatToolCategory(call.name, call.mcpIdentity) === 'mcpToolCall')
      ? nativeChatToolArguments(call.name, call.input)
      : NO_TOOL_ARGUMENTS
  const toolArguments = parsedArguments.some((argument) => argument.parts !== null)
    ? parsedArguments
    : NO_TOOL_ARGUMENTS
  const hasDetail =
    body !== undefined ||
    toolArguments.length > 0 ||
    label?.commandDetail != null ||
    results.length > 0 ||
    (call !== undefined && diffFromToolCall(call.name, call.input) !== null)
  const resultPreview = call ? '' : (body?.output.split('\n')[0]?.slice(0, 80) ?? '')
  return { call, label, body, resultPreview, failed, results, hasDetail, toolArguments }
}
