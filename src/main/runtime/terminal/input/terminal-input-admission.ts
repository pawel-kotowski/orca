import type { OrcaRuntimeService } from '../../orca-runtime'

/** `login-move`: the line that restarts a chat's Claude on another login, while other input waits. */
export type TerminalInputSource = 'desktop' | 'programmatic' | 'mobile' | 'legacy' | 'login-move'
export class TerminalInputPausedError extends Error {}

const heldForLoginMove = new Set<string>()

/** While a chat's Claude restarts, a message would land in its bare shell as a command. */
export function holdTerminalInputForLoginMove(ptyId: string): () => void {
  heldForLoginMove.add(ptyId)
  return () => heldForLoginMove.delete(ptyId)
}

type InputDriver = Pick<OrcaRuntimeService, 'getDriver'>

export function isTerminalInputPaused(
  runtime: InputDriver,
  ptyId: string,
  source: TerminalInputSource = 'programmatic'
): boolean {
  if (source !== 'login-move' && heldForLoginMove.has(ptyId)) {
    return true
  }
  return source === 'desktop' && runtime.getDriver(ptyId).kind === 'mobile'
}

export function assertTerminalInputAdmitted(
  runtime: InputDriver,
  ptyId: string,
  source: TerminalInputSource = 'programmatic'
): void {
  if (isTerminalInputPaused(runtime, ptyId, source)) {
    throw new TerminalInputPausedError()
  }
}

export function createTerminalInputReservation(
  runtime: InputDriver,
  source: TerminalInputSource | undefined,
  reserveWrite: ((ptyId: string) => void) | undefined
): (ptyId: string) => void {
  let first = true
  return (ptyId) => {
    // Accepted input belongs to this operation through its chunks and first Enter.
    if (first) {
      assertTerminalInputAdmitted(runtime, ptyId, source)
      first = false
    }
    reserveWrite?.(ptyId)
  }
}
