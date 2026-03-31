-- TaskForge SQLite schema (reference; applied via database.ts)

CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority TEXT NOT NULL DEFAULT 'normal',
  tags TEXT DEFAULT '[]',
  draft INTEGER NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run_at TEXT,
  last_run_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_template_id TEXT,
  concurrency TEXT NOT NULL DEFAULT 'allow'
);

CREATE TABLE IF NOT EXISTS workflow_nodes (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  node_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  position_x REAL DEFAULT 0,
  position_y REAL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workflow_edges (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  trigger_kind TEXT,
  message TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS log_steps (
  id TEXT PRIMARY KEY,
  log_id TEXT NOT NULL REFERENCES execution_logs(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  step_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  message TEXT,
  error TEXT,
  output TEXT
);

CREATE TABLE IF NOT EXISTS variables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  is_secret INTEGER NOT NULL DEFAULT 0,
  scope TEXT NOT NULL DEFAULT 'global'
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT 'localhost',
  status TEXT NOT NULL DEFAULT 'Success',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  last_active TEXT,
  workflow_count INTEGER NOT NULL DEFAULT 0,
  is_self INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_wf ON workflow_nodes(workflow_id);
CREATE INDEX IF NOT EXISTS idx_edges_wf ON workflow_edges(workflow_id);
CREATE INDEX IF NOT EXISTS idx_logs_wf ON execution_logs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_log_steps_log ON log_steps(log_id);
