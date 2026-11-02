import type Database from '../../../../sqlite/sync-database'

/**
 * Why: Paweł's fork build once shipped its own v44 (`messages.pointer_delivery`, for
 * `send --deliver now`) before upstream defined a different v44 (worker auto-release). A database
 * that build stamped 44 lacks upstream's v44 columns, so it is really v43 plus one unused column;
 * read as 44, the completeness probe fails, the migration replays from v6 and dies at v34.
 */
export function repairForkStampedSchemaVersion(
  db: Database.Database,
  storedVersion: number
): number {
  if (storedVersion !== 44) {
    return storedVersion
  }
  const hasColumn = (table: string, column: string): boolean =>
    (db.pragma(`table_info(${table})`) as { name: string }[]).some((row) => row.name === column)
  return hasColumn('messages', 'pointer_delivery') &&
    !hasColumn('worker_terminal_resources', 'auto_release_at')
    ? 43
    : storedVersion
}
