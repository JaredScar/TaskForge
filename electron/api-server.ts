import express from 'express';
import cors from 'cors';
import { app as electronApp } from 'electron';
import type Database from 'better-sqlite3';
import type { AutomationEngine } from './engine/automation-engine';
import type { TriggerManager } from './engine/trigger-manager';
import { randomUUID } from 'node:crypto';
import { isLocalDevRestApiPlaceholder } from './dev-placeholders';

export function startApiServer(
  db: Database.Database,
  engine: AutomationEngine,
  triggers: TriggerManager,
  port = 38474
): { stop: () => void } {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    const auth = req.headers.authorization ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    const bearer = m?.[1]?.trim() ?? '';
    /* Unpackaged dev only: well-known placeholder works for local curl/scripts. Packaged apps always require the real DB key. */
    if (!electronApp.isPackaged && isLocalDevRestApiPlaceholder(bearer)) {
      next();
      return;
    }
    const key = (db.prepare(`SELECT value FROM settings WHERE key = 'api_key'`).get() as { value: string } | undefined)?.value;
    if (!key || auth !== `Bearer ${key}`) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    next();
  });

  app.get('/v1/workflows', (_req, res) => {
    const workflows = db
      .prepare(
        `SELECT id, name, description, enabled, priority, tags, draft, run_count, last_run_at, last_run_summary, created_at, updated_at FROM workflows ORDER BY updated_at DESC`
      )
      .all();
    res.json({ workflows });
  });

  app.get('/v1/workflows/:id', (req, res) => {
    const id = req.params['id'];
    const wf = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id);
    if (!wf) {
      res.status(404).json({ error: 'workflow not found' });
      return;
    }
    const nodes = db.prepare(`SELECT * FROM workflow_nodes WHERE workflow_id = ? ORDER BY sort_order`).all(id);
    const edges = db.prepare(`SELECT * FROM workflow_edges WHERE workflow_id = ?`).all(id);
    res.json({ workflow: wf, nodes, edges });
  });

  app.get('/v1/logs', (_req, res) => {
    const logs = db.prepare(`SELECT * FROM execution_logs ORDER BY started_at DESC LIMIT 200`).all();
    res.json({ logs });
  });

  app.get('/v1/logs/:id', (req, res) => {
    const id = req.params['id'];
    const log = db.prepare(`SELECT * FROM execution_logs WHERE id = ?`).get(id);
    if (!log) {
      res.status(404).json({ error: 'log not found' });
      return;
    }
    const steps = db.prepare(`SELECT * FROM log_steps WHERE log_id = ? ORDER BY rowid`).all(id);
    res.json({ log, steps });
  });

  app.get('/v1/variables', (_req, res) => {
    const rows = db
      .prepare(`SELECT id, name, type, value, scope FROM variables WHERE is_secret = 0 ORDER BY name`)
      .all();
    res.json({ variables: rows });
  });

  app.post('/v1/workflows/run', async (req, res) => {
    const workflowId = (req.body as { workflow_id?: string })?.workflow_id;
    if (!workflowId) {
      res.status(400).json({ error: 'workflow_id required' });
      return;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource, ip, status, created_at) VALUES (?, ?, 'workflow.run', ?, ?, 'Success', ?)`
    ).run(id, 'api', workflowId, req.ip ?? 'localhost', now);
    await engine.runWorkflow(workflowId, 'api');
    triggers.reloadFromDatabase();
    res.json({ ok: true, workflow_id: workflowId });
  });

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`TaskForge API listening on http://127.0.0.1:${port}`);
  });

  return {
    stop: () => {
      server.close();
    },
  };
}
