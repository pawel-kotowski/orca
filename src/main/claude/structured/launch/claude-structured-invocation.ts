// The Claude binary, prefix and environment a chat or a catalog probe runs with.
import type { ClaudeStructuredAuthPolicy } from '../../../claude-accounts/runtime-auth/claude-structured-auth-policy'
import { assertStructuredAgentResolutionCurrent } from '../../../native-chat/agent-launch/structured-agent-command-resolution'
import {
  claudeChildEnv,
  resolveClaudeChildEnvSources,
  type ClaudeChildEnvSources,
  type ClaudeEnvDeps
} from './claude-structured-child-env'

export type ClaudeStructuredInvocation = {
  command: string
  prefixArgs: string[]
  env: Record<string, string>
  account: 'managed' | 'system'
}

/** Share binary/env resolution with catalog probes; inherited env drift heals on refresh. */
export async function resolveClaudeStructuredInvocation(
  deps: ClaudeEnvDeps & {
    resolveAuthPolicy: () => Promise<ClaudeStructuredAuthPolicy> | ClaudeStructuredAuthPolicy
  },
  decorateEnv: (env: Record<string, string>) => Record<string, string> = (env) => env,
  /** Already resolved by a caller that needed them earlier; read again otherwise. */
  resolvedSources?: ClaudeChildEnvSources,
  options?: Parameters<typeof claudeChildEnv>[2]
): Promise<ClaudeStructuredInvocation> {
  const sources = resolvedSources ?? (await resolveClaudeChildEnvSources(deps))
  assertStructuredAgentResolutionCurrent(deps.operation)
  deps.signal?.throwIfAborted()
  const auth = await deps.resolveAuthPolicy()
  assertStructuredAgentResolutionCurrent(deps.operation)
  deps.signal?.throwIfAborted()
  // Preserve proxy credentials alongside ANTHROPIC_BASE_URL for every account.
  return {
    command: sources.command,
    prefixArgs: sources.prefixArgs,
    env: claudeChildEnv(sources, decorateEnv, options),
    account: auth.account
  }
}
