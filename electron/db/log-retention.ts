import type Database from 'better-sqlite3';

/**
 * Delete execution_logs rows older than `log_retention_days` days.
 * Respects the `log_retention_forever` flag — no rows are deleted when it is set.
 * Called at startup and on a daily interval.
 */
export function purgeOldLogs(db: Database.Database): void {
  try {
    const forever = (db.prepare(`SELECT value FROM settings WHERE key = 'log_retention_forever'`).get() as { value: string } | undefined)?.value;
    if (forever === '1' || forever === 'true') return;

    const raw = (db.prepare(`SELECT value FROM settings WHERE key = 'log_retention_days'`).get() as { value: string } | undefined)?.value ?? '30';
    const days = parseInt(raw, 10);
    if (!Number.isFinite(days) || days <= 0) return;

    db.prepare(`DELETE FROM execution_logs WHERE created_at < datetime('now', '-' || ? || ' days')`).run(days);
  } catch (e) {
    console.error('[taskforge] purgeOldLogs failed', e);
  }
}
