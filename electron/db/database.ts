import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import type BetterSqlite3 from 'better-sqlite3';
import {
  LEGACY_ROAMING_SQLITE_BASENAME,
  LEGACY_ROAMING_USERDATA_DIR_NAMES,
  LEGACY_SELF_TEAM_EMAIL,
} from '../legacy-paths';

/** Lazy require so ABI errors can be caught in main (not at module load). */
function loadBetterSqlite3(): typeof BetterSqlite3 {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('better-sqlite3') as typeof BetterSqlite3;
}

function loadSchemaSql(): string {
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, 'db', 'schema.sql'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }
  throw new Error('schema.sql not found next to compiled database.js');
}

function runMigrations(db: InstanceType<typeof BetterSqlite3>): void {
  const maxVer = () =>
    (db.prepare(`SELECT MAX(version) as v FROM schema_migrations`).get() as { v: number | null }).v ?? 0;
  const now = new Date().toISOString();

  if (maxVer() < 1) {
    db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)`).run(now);
  }
  if (maxVer() < 2) {
    /* Remove legacy demo rows from older app versions (fixed IDs / seed names only). */
    db.prepare(`DELETE FROM workflows WHERE id IN ('wf_morning','wf_backup','wf_workmode','wf_clean')`).run();
    db.prepare(
      `DELETE FROM team_members WHERE email IN ('alex@company.com','sarah@company.com','mike@company.com')`
    ).run();
    db.prepare(
      `DELETE FROM variables WHERE name IN ('BACKUP_PATH','WORK_WIFI','SLACK_WEBHOOK','RETRY_COUNT','DEBUG_MODE')`
    ).run();
    db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)`).run(now);
  }
  if (maxVer() < 3) {
    /* Collapse duplicate workflows created by the old builder default name "Morning Startup v3" (keep newest). */
    const dupName = 'Morning Startup v3';
    const rows = db.prepare(`SELECT id FROM workflows WHERE name = ? ORDER BY updated_at DESC`).all(dupName) as { id: string }[];
    for (let i = 1; i < rows.length; i++) {
      db.prepare(`DELETE FROM workflows WHERE id = ?`).run(rows[i].id);
    }
    db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (3, ?)`).run(now);
  }
  if (maxVer() < 4) {
    const cols = db.prepare(`PRAGMA table_info(workflows)`).all() as { name: string }[];
    const names = new Set(cols.map((c) => c.name));
    if (!names.has('source_template_id')) {
      db.exec(`ALTER TABLE workflows ADD COLUMN source_template_id TEXT`);
    }
    if (!names.has('concurrency')) {
      db.exec(`ALTER TABLE workflows ADD COLUMN concurrency TEXT NOT NULL DEFAULT 'allow'`);
    }
    db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (4, ?)`).run(now);
  }
  if (maxVer() < 5) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        scopes TEXT NOT NULL DEFAULT '["*"]',
        created_at TEXT NOT NULL,
        is_primary INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS trigger_state (
        workflow_id TEXT NOT NULL,
        trigger_node_id TEXT NOT NULL,
        last_fired_at TEXT NOT NULL,
        PRIMARY KEY (workflow_id, trigger_node_id)
      );
      CREATE INDEX IF NOT EXISTS idx_api_keys_token ON api_keys(token);
    `);
    const cnt = (db.prepare(`SELECT COUNT(*) as c FROM api_keys`).get() as { c: number }).c;
    if (cnt === 0) {
      const tok = (db.prepare(`SELECT value FROM settings WHERE key = 'api_key'`).get() as { value: string } | undefined)?.value;
      if (tok) {
        db.prepare(
          `INSERT INTO api_keys (id, name, token, scopes, created_at, is_primary) VALUES (?, 'Default', ?, '["*"]', ?, 1)`
        ).run(randomUUID(), tok, now);
      }
    }
    db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (5, ?)`).run(now);
  }
  if (maxVer() < 6) {
    const cols = db.prepare(`PRAGMA table_info(variables)`).all() as { name: string }[];
    if (!cols.some((c) => c.name === 'description')) {
      db.exec(`ALTER TABLE variables ADD COLUMN description TEXT NOT NULL DEFAULT ''`);
    }
    db.prepare(`INSERT INTO schema_migrations (version, applied_at) VALUES (6, ?)`).run(now);
  }
}

/** Keep primary REST token mirrored in api_keys for scoped API access. */
function ensureApiKeysSynced(db: InstanceType<typeof BetterSqlite3>): void {
  const count = (db.prepare(`SELECT COUNT(*) as c FROM api_keys`).get() as { c: number }).c;
  if (count > 0) return;
  const tok = (db.prepare(`SELECT value FROM settings WHERE key = 'api_key'`).get() as { value: string } | undefined)?.value;
  if (!tok) return;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO api_keys (id, name, token, scopes, created_at, is_primary) VALUES (?, 'Default', ?, '["*"]', ?, 1)`
  ).run(randomUUID(), tok, now);
}

/** API key, local user row, and default settings — safe to run on every startup. */
function ensureAppDefaults(db: InstanceType<typeof BetterSqlite3>): void {
  const hasApi = db.prepare(`SELECT 1 FROM settings WHERE key = 'api_key'`).get();
  if (!hasApi) {
    const key = 'tf_live_' + randomUUID().replace(/-/g, '').slice(0, 24);
    db.prepare(`INSERT INTO settings (key, value) VALUES ('api_key', ?)`).run(key);
  }

  db.prepare(`UPDATE team_members SET email = ? WHERE is_self = 1 AND email = ?`).run('local@taskforge.app', LEGACY_SELF_TEAM_EMAIL);

  const hasSelf = db.prepare(`SELECT 1 FROM team_members WHERE is_self = 1`).get();
  if (!hasSelf) {
    db.prepare(
      `INSERT INTO team_members (id, email, display_name, role, last_active, workflow_count, is_self) VALUES (?, ?, ?, ?, NULL, 0, 1)`
    ).run(randomUUID(), 'local@taskforge.app', 'You', 'Owner');
  }

  const defaults: [string, string][] = [
    ['log_retention_days', '30'],
    ['log_retention_forever', '0'],
    ['clear_logs_on_startup', '0'],
    ['engine_auto_start', '1'],
    ['notify_desktop', '1'],
    ['toast_position', 'bottom'],
    ['sound_on_workflow_failure', '0'],
    ['replay_missed_cron', '0'],
    ['default_workflow_priority', 'normal'],
    ['ui_locale', 'en'],
    ['ui_theme', 'dark'],
    ['ui_accent', 'green'],
    ['builder_show_json_default', '0'],
    ['max_concurrent_workflows', '5'],
    ['confirm_delete_workflow', '1'],
  ];
  const ins = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of defaults) {
    ins.run(k, v);
  }

  ensureApiKeysSynced(db);
}

/** Copy legacy DB from pre-rename userData folders (same parent as current `userData`). */
function migrateLegacySqliteIfNeeded(userData: string): void {
  const newDb = path.join(userData, 'taskforge.db');
  if (fs.existsSync(newDb)) return;

  const parent = path.dirname(userData);
  for (const dirName of LEGACY_ROAMING_USERDATA_DIR_NAMES) {
    const legacyDir = path.join(parent, dirName);
    const oldDb = path.join(legacyDir, LEGACY_ROAMING_SQLITE_BASENAME);
    if (!fs.existsSync(oldDb)) continue;
    fs.mkdirSync(userData, { recursive: true });
    for (const ext of ['', '-wal', '-shm'] as const) {
      const from = oldDb + ext;
      const to = newDb + ext;
      if (fs.existsSync(from)) {
        try {
          fs.copyFileSync(from, to);
        } catch {
          /* ignore partial copy */
        }
      }
    }
    return;
  }
}

export function openDatabase(): InstanceType<typeof BetterSqlite3> {
  const BetterSqlite3 = loadBetterSqlite3();
  const userData = app.getPath('userData');
  migrateLegacySqliteIfNeeded(userData);
  const dbPath = path.join(userData, 'taskforge.db');
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  /* Reduce risk of losing recent writes if the process is killed (e.g. dev terminal Ctrl+C). */
  db.pragma('synchronous = FULL');
  db.exec(loadSchemaSql());
  runMigrations(db);
  ensureAppDefaults(db);
  return db;
}
