import { agentHookServer } from '../agent-hooks/server/agent-hook-server'
import { installIdleCompaction } from '../agent-hooks/idle-compaction/idle-compaction-install'
import { installClaudeLoginMoves } from '../claude-accounts/session-login/claude-login-move-install'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'

/**
 * The local build's host followers on Electron, desktop and `serve` alike (orcad installs the same
 * two in core-runtime-activation): idle compaction, and chat login moves that wait for a turn.
 */
export function installLocalHostFollowers(
  runtime: OrcaRuntimeService,
  getRuntime: () => OrcaRuntimeService | null
): () => void {
  const uninstall = [
    installIdleCompaction(agentHookServer, getRuntime),
    installClaudeLoginMoves(runtime)
  ]
  return () => uninstall.forEach((stop) => stop())
}
