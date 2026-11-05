// Lines the main process keeps in userData/logs/glass-diagnostics.log (glass-diagnostics-log.ts),
// for bugs seen only right after a restart, where nothing can be inspected live.
const PREFIX = '[orca-glass-diag]'

export function glassDiagnostic(event: string, fields: Record<string, unknown>): void {
  if (import.meta.env.MODE === 'test') {
    return
  }
  try {
    console.info(`${PREFIX} ${event} ${JSON.stringify(fields)}`)
  } catch {
    // A diagnostic never breaks the caller.
  }
}
