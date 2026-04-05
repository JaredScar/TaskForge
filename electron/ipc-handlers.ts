import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import { ipcHandle } from './ipc-handle';
import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AutomationEngine } from './engine/automation-engine';
import type { TriggerManager } from './engine/trigger-manager';
import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { findMarketplaceTemplate, resolveMarketplaceCatalog } from './marketplace-remote';
import {
  buildWorkflowParseMessages,
  completeWorkflowJson,
  parseWorkflowFromModelText,
  streamWorkflowCompletion,
  type AiChatMsg,
} from './ai-workflow';
import { writeAuditLog } from './db/audit';
import { defaultActionConfig, defaultConditionConfig, defaultTriggerConfig, stubTimeTriggerConfig } from './catalog-starters';
import {
  assertProEnterprise,
  EntitlementRequiredError,
  isProEnterpriseUnlocked,
  PRO_ACTION_KINDS,
  PRO_ENTITLEMENT_SETTINGS_KEY,
  PRO_TRIGGER_KINDS,
  validateProEnterpriseKey,
  workflowNodesRequireProEntitlement,
} from './entitlement';
import {
  clearOnlineEntitlementCache,
  getLicenseApiUrl,
  getLicenseMode,
  refreshLicenseOnline,
} from './license-remote';
import * as si from 'systeminformation';
import { isLocalDevOpenAiPlaceholder } from './dev-placeholders';

function parseScopesJsonSafe(raw: string): string[] {
  try {
    const j = JSON.parse(raw) as unknown;
    return Array.isArray(j) ? j.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function registerIpcHandlers(
  db: Database.Database,
  engine: AutomationEngine,
  triggers: TriggerManager,
  getWin: () => BrowserWindow | null
): void {
  ipcHandle('entitlement:getStatus', () => {
    const url = getLicenseApiUrl();
    const mode = getLicenseMode();
    return {
      unlocked: isProEnterpriseUnlocked(db),
      licenseServerConfigured: Boolean(url),
      licenseMode: mode,
    };
  });

  ipcHandle('entitlement:refreshOnline', async () => {
    const r = await refreshLicenseOnline(db);
    return { ok: r.ok, unlocked: isProEnterpriseUnlocked(db), error: r.error };
  });

  ipcHandle('entitlement:setKey', async (_e, key: string) => {
    const trimmed = String(key ?? '').trim();
    const url = getLicenseApiUrl();
    const mode = getLicenseMode();

    if (!trimmed) {
      db.prepare(`DELETE FROM settings WHERE key = ?`).run(PRO_ENTITLEMENT_SETTINGS_KEY);
      clearOnlineEntitlementCache(db);
      writeAuditLog(db, 'settings.set', `${PRO_ENTITLEMENT_SETTINGS_KEY}.cleared`);
      return { ok: true as const, unlocked: false as const };
    }

    if (mode === 'online_strict' && url) {
      db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(PRO_ENTITLEMENT_SETTINGS_KEY, trimmed);
      const remote = await refreshLicenseOnline(db);
      if (!remote.ok) {
        db.prepare(`DELETE FROM settings WHERE key = ?`).run(PRO_ENTITLEMENT_SETTINGS_KEY);
        clearOnlineEntitlementCache(db);
        return {
          ok: false as const,
          unlocked: false as const,
          error: (remote.error === 'invalid' ? 'invalid_key' : 'network') as 'invalid_key' | 'network',
        };
      }
      writeAuditLog(db, 'settings.set', PRO_ENTITLEMENT_SETTINGS_KEY);
      return { ok: true as const, unlocked: true as const };
    }

    if (!validateProEnterpriseKey(trimmed)) {
      return { ok: false as const, unlocked: isProEnterpriseUnlocked(db), error: 'invalid_key' as const };
    }

    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(PRO_ENTITLEMENT_SETTINGS_KEY, trimmed);

    if (url && mode === 'hybrid') {
      const remote = await refreshLicenseOnline(db);
      if (!remote.ok) {
        db.prepare(`DELETE FROM settings WHERE key = ?`).run(PRO_ENTITLEMENT_SETTINGS_KEY);
        clearOnlineEntitlementCache(db);
        return {
          ok: false as const,
          unlocked: false as const,
          error: 'network' as const,
        };
      }
    }

    writeAuditLog(db, 'settings.set', PRO_ENTITLEMENT_SETTINGS_KEY);
    return { ok: true as const, unlocked: true as const };
  });

  ipcHandle('workflows:list', () => {
    return db.prepare(`SELECT * FROM workflows ORDER BY updated_at DESC`).all();
  });

  ipcHandle('workflows:get', (_e, id: string) => {
    const wf = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(id);
    if (!wf) return null;
    const nodes = db.prepare(`SELECT * FROM workflow_nodes WHERE workflow_id = ? ORDER BY sort_order`).all(id);
    const edges = db.prepare(`SELECT * FROM workflow_edges WHERE workflow_id = ?`).all(id);
    return { workflow: wf, nodes, edges };
  });

  ipcHandle('workflows:create', (_e, payload: { name: string; description?: string }) => {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workflows (id, name, description, enabled, priority, tags, draft, run_count, created_at, updated_at)
       VALUES (?, ?, ?, 1, 'normal', '[]', 1, 0, ?, ?)`
    ).run(id, payload.name, payload.description ?? '', now, now);
    writeAuditLog(db, 'workflow.create', `${payload.name} (${id})`);
    triggers.reloadFromDatabase();
    return id;
  });

  ipcHandle(
    'workflows:update',
    (_e, payload: { id: string; name?: string; description?: string; priority?: string; tags?: string[]; draft?: boolean; concurrency?: string; nodes?: unknown[]; edges?: unknown[] }) => {
      const now = new Date().toISOString();
      const cur = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(payload.id) as Record<string, unknown> | undefined;
      if (!cur) return false;
      if (
        payload.nodes !== undefined &&
        payload.nodes !== null &&
        !Array.isArray(payload.nodes)
      ) {
        throw new Error('workflows:update requires `nodes` to be an array when provided');
      }
      if (
        Array.isArray(payload.nodes) &&
        workflowNodesRequireProEntitlement(payload.nodes as Array<Record<string, unknown>>) &&
        !isProEnterpriseUnlocked(db)
      ) {
        throw new EntitlementRequiredError();
      }
      const conc =
        payload.concurrency != null && ['allow', 'queue', 'skip'].includes(payload.concurrency) ? payload.concurrency : null;
      db.prepare(
        `UPDATE workflows SET name = COALESCE(?, name), description = COALESCE(?, description), priority = COALESCE(?, priority), tags = COALESCE(?, tags), draft = COALESCE(?, draft), concurrency = COALESCE(?, concurrency), updated_at = ? WHERE id = ?`
      ).run(
        payload.name ?? null,
        payload.description ?? null,
        payload.priority ?? null,
        payload.tags != null ? JSON.stringify(payload.tags) : null,
        payload.draft != null ? (payload.draft ? 1 : 0) : null,
        conc,
        now,
        payload.id
      );
      if (Array.isArray(payload.nodes)) {
        db.prepare(`DELETE FROM workflow_edges WHERE workflow_id = ?`).run(payload.id);
        db.prepare(`DELETE FROM workflow_nodes WHERE workflow_id = ?`).run(payload.id);
        const ins = db.prepare(
          `INSERT INTO workflow_nodes (id, workflow_id, node_type, kind, config, position_x, position_y, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const n of payload.nodes as Array<Record<string, unknown>>) {
          ins.run(
            String(n['id'] ?? randomUUID()),
            payload.id,
            String(n['node_type']),
            String(n['kind']),
            typeof n['config'] === 'string' ? n['config'] : JSON.stringify(n['config'] ?? {}),
            Number(n['position_x'] ?? 0),
            Number(n['position_y'] ?? 0),
            Number(n['sort_order'] ?? 0)
          );
        }
      }
      if (payload.edges) {
        const insE = db.prepare(
          `INSERT INTO workflow_edges (id, workflow_id, source_node_id, target_node_id) VALUES (?, ?, ?, ?)`
        );
        for (const e of payload.edges as Array<Record<string, unknown>>) {
          insE.run(String(e['id'] ?? randomUUID()), payload.id, String(e['source_node_id']), String(e['target_node_id']));
        }
      }
      writeAuditLog(db, 'workflow.update', payload.id);
      triggers.reloadFromDatabase();
      return true;
    }
  );

  ipcHandle('workflows:delete', (_e, id: string) => {
    db.prepare(`DELETE FROM workflows WHERE id = ?`).run(id);
    writeAuditLog(db, 'workflow.delete', id);
    triggers.reloadFromDatabase();
    return true;
  });

  ipcHandle('workflows:toggle', (_e, id: string) => {
    const row = db.prepare(`SELECT enabled FROM workflows WHERE id = ?`).get(id) as { enabled: number } | undefined;
    if (!row) return false;
    const next = row.enabled ? 0 : 1;
    db.prepare(`UPDATE workflows SET enabled = ?, updated_at = ? WHERE id = ?`).run(next, new Date().toISOString(), id);
    writeAuditLog(db, next ? 'workflow.enable' : 'workflow.disable', id);
    triggers.reloadFromDatabase();
    return next === 1;
  });

  ipcHandle('workflows:setEnabled', (_e, payload: { id: string; enabled: boolean }) => {
    const wf = db.prepare(`SELECT id FROM workflows WHERE id = ?`).get(payload.id);
    if (!wf) return false;
    const en = payload.enabled ? 1 : 0;
    db.prepare(`UPDATE workflows SET enabled = ?, updated_at = ? WHERE id = ?`).run(en, new Date().toISOString(), payload.id);
    writeAuditLog(db, en ? 'workflow.enable' : 'workflow.disable', payload.id);
    triggers.reloadFromDatabase();
    return true;
  });

  ipcHandle('workflows:duplicate', (_e, sourceId: string) => {
    const wf = db.prepare(`SELECT * FROM workflows WHERE id = ?`).get(sourceId) as Record<string, unknown> | undefined;
    if (!wf) return '';
    const newId = randomUUID();
    const now = new Date().toISOString();
    const baseName = String(wf['name'] ?? 'Workflow');
    const name = `Copy of ${baseName}`.slice(0, 200);
    const conc = String(wf['concurrency'] ?? 'allow');
    db.prepare(
      `INSERT INTO workflows (id, name, description, enabled, priority, tags, draft, run_count, last_run_at, last_run_summary, created_at, updated_at, source_template_id, concurrency)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, NULL, NULL, ?, ?, NULL, ?)`
    ).run(
      newId,
      name,
      String(wf['description'] ?? ''),
      Number(wf['enabled'] ?? 1),
      String(wf['priority'] ?? 'normal'),
      String(wf['tags'] ?? '[]'),
      now,
      now,
      ['allow', 'queue', 'skip'].includes(conc) ? conc : 'allow'
    );
    const nodes = db
      .prepare(`SELECT * FROM workflow_nodes WHERE workflow_id = ? ORDER BY sort_order`)
      .all(sourceId) as Record<string, unknown>[];
    const idMap = new Map<string, string>();
    const ins = db.prepare(
      `INSERT INTO workflow_nodes (id, workflow_id, node_type, kind, config, position_x, position_y, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const n of nodes) {
      const oldNodeId = String(n['id']);
      const nid = randomUUID();
      idMap.set(oldNodeId, nid);
      ins.run(
        nid,
        newId,
        String(n['node_type']),
        String(n['kind']),
        String(n['config'] ?? '{}'),
        Number(n['position_x'] ?? 0),
        Number(n['position_y'] ?? 0),
        Number(n['sort_order'] ?? 0)
      );
    }
    const edges = db.prepare(`SELECT * FROM workflow_edges WHERE workflow_id = ?`).all(sourceId) as Record<string, unknown>[];
    const insE = db.prepare(
      `INSERT INTO workflow_edges (id, workflow_id, source_node_id, target_node_id) VALUES (?, ?, ?, ?)`
    );
    for (const e of edges) {
      const src = idMap.get(String(e['source_node_id']));
      const tgt = idMap.get(String(e['target_node_id']));
      if (src && tgt) insE.run(randomUUID(), newId, src, tgt);
    }
    writeAuditLog(db, 'workflow.duplicate', `${sourceId} → ${newId}`);
    triggers.reloadFromDatabase();
    return newId;
  });

  ipcHandle('catalog:usageByKind', (_e, nodeType: 'trigger' | 'action') => {
    const rows = db
      .prepare(`SELECT kind, COUNT(*) as c FROM workflow_nodes WHERE node_type = ? GROUP BY kind`)
      .all(nodeType) as { kind: string; c: number }[];
    return rows.map((r) => ({ kind: r.kind, count: r.c }));
  });

  ipcHandle(
    'workflows:createFromStarter',
    (_e, payload: { mode: 'trigger' | 'action'; kind: string; displayTitle: string }) => {
      const needsPro =
        (payload.mode === 'trigger' && PRO_TRIGGER_KINDS.has(payload.kind)) ||
        (payload.mode === 'action' && PRO_ACTION_KINDS.has(payload.kind));
      if (needsPro && !isProEnterpriseUnlocked(db)) throw new EntitlementRequiredError();
      const id = randomUUID();
      const now = new Date().toISOString();
      const name = `New · ${payload.displayTitle}`;
      db.prepare(
        `INSERT INTO workflows (id, name, description, enabled, priority, tags, draft, run_count, created_at, updated_at)
         VALUES (?, ?, '', 1, 'normal', '[]', 1, 0, ?, ?)`
      ).run(id, name, now, now);
      const ins = db.prepare(
        `INSERT INTO workflow_nodes (id, workflow_id, node_type, kind, config, position_x, position_y, sort_order) VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
      );
      let order = 0;
      if (payload.mode === 'action') {
        ins.run(randomUUID(), id, 'trigger', 'time_schedule', JSON.stringify(stubTimeTriggerConfig()), order++);
      }
      const nodeKind = payload.kind;
      const config =
        payload.mode === 'trigger'
          ? JSON.stringify(defaultTriggerConfig(nodeKind))
          : JSON.stringify(defaultActionConfig(nodeKind));
      ins.run(randomUUID(), id, payload.mode === 'trigger' ? 'trigger' : 'action', nodeKind, config, order);
      writeAuditLog(db, 'workflow.create', `starter:${payload.mode}:${payload.kind} (${id})`);
      triggers.reloadFromDatabase();
      return id;
    }
  );

  ipcHandle(
    'workflows:appendNode',
    (_e, payload: { workflowId: string; nodeType: 'trigger' | 'condition' | 'action'; kind: string }) => {
      const needsPro =
        (payload.nodeType === 'trigger' && PRO_TRIGGER_KINDS.has(payload.kind)) ||
        (payload.nodeType === 'action' && PRO_ACTION_KINDS.has(payload.kind));
      if (needsPro && !isProEnterpriseUnlocked(db)) throw new EntitlementRequiredError();
      const wf = db.prepare(`SELECT id FROM workflows WHERE id = ?`).get(payload.workflowId);
      if (!wf) return false;
      const row = db
        .prepare(`SELECT MAX(sort_order) as m FROM workflow_nodes WHERE workflow_id = ?`)
        .get(payload.workflowId) as { m: number | null };
      const next = (row.m ?? -1) + 1;
      let configObj: Record<string, unknown>;
      if (payload.nodeType === 'trigger') configObj = defaultTriggerConfig(payload.kind);
      else if (payload.nodeType === 'action') configObj = defaultActionConfig(payload.kind);
      else configObj = defaultConditionConfig(payload.kind);
      db.prepare(
        `INSERT INTO workflow_nodes (id, workflow_id, node_type, kind, config, position_x, position_y, sort_order) VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
      ).run(randomUUID(), payload.workflowId, payload.nodeType, payload.kind, JSON.stringify(configObj), next);
      db.prepare(`UPDATE workflows SET updated_at = ?, draft = 1 WHERE id = ?`).run(new Date().toISOString(), payload.workflowId);
      writeAuditLog(db, 'workflow.node.append', `${payload.workflowId}:${payload.kind}`);
      triggers.reloadFromDatabase();
      return true;
    }
  );

  ipcHandle('logs:list', (_e, opts?: { limit?: number; workflowId?: string }) => {
    const lim = opts?.limit ?? 200;
    const wf = opts?.workflowId?.trim();
    if (wf) {
      return db
        .prepare(`SELECT * FROM execution_logs WHERE workflow_id = ? ORDER BY started_at DESC LIMIT ?`)
        .all(wf, lim);
    }
    return db.prepare(`SELECT * FROM execution_logs ORDER BY started_at DESC LIMIT ?`).all(lim);
  });

  ipcHandle('logs:get', (_e, id: string) => {
    const log = db.prepare(`SELECT * FROM execution_logs WHERE id = ?`).get(id);
    const steps = db.prepare(`SELECT * FROM log_steps WHERE log_id = ? ORDER BY rowid`).all(id);
    return { log, steps };
  });

  ipcHandle('logs:clear', () => {
    db.prepare(`DELETE FROM log_steps`).run();
    db.prepare(`DELETE FROM execution_logs`).run();
    writeAuditLog(db, 'logs.clear', 'all');
    return true;
  });

  ipcHandle('logs:export', async (_e, format: 'csv' | 'json' = 'csv') => {
    const win = getWin();
    const rows = db
      .prepare(
        `SELECT e.id, e.workflow_id, e.started_at, e.finished_at, e.status, e.trigger_kind, e.message, e.error, w.name as workflow_name
         FROM execution_logs e
         LEFT JOIN workflows w ON w.id = e.workflow_id
         ORDER BY e.started_at DESC`
      )
      .all() as Record<string, unknown>[];
    const dlgOpts =
      format === 'json'
        ? {
            defaultPath: 'taskforge-logs.json',
            filters: [{ name: 'JSON', extensions: ['json'] }],
          }
        : {
            defaultPath: 'taskforge-logs.csv',
            filters: [{ name: 'CSV', extensions: ['csv'] }],
          };
    const { filePath } = win ? await dialog.showSaveDialog(win, dlgOpts) : await dialog.showSaveDialog(dlgOpts);
    if (!filePath) return null;
    if (format === 'json') {
      const stepStmt = db.prepare(
        `SELECT step_type, step_kind, status, duration_ms, message, error, output FROM log_steps WHERE log_id = ? ORDER BY id ASC`
      );
      const payload = {
        exported_at: new Date().toISOString(),
        format: 'taskforge-execution-logs-v1',
        logs: rows.map((r) => ({
          ...r,
          steps: stepStmt.all(String(r['id'])),
        })),
      };
      fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    } else {
      const esc = (c: unknown) => `"${String(c ?? '').replace(/"/g, '""')}"`;
      const header = 'id,workflow_id,workflow_name,started_at,finished_at,status,trigger_kind,message,error\n';
      const body = rows
        .map((r) =>
          [
            r['id'],
            r['workflow_id'],
            r['workflow_name'],
            r['started_at'],
            r['finished_at'],
            r['status'],
            r['trigger_kind'],
            r['message'],
            r['error'],
          ]
            .map(esc)
            .join(',')
        )
        .join('\n');
      fs.writeFileSync(filePath, header + body, 'utf-8');
    }
    writeAuditLog(db, 'logs.export', filePath);
    return filePath;
  });

  ipcHandle('dialog:pickExecutable', async () => {
    const win = getWin();
    const platform = process.platform;
    const filters =
      platform === 'win32'
        ? [
            { name: 'Programs', extensions: ['exe', 'cmd', 'bat', 'ps1'] },
            { name: 'All files', extensions: ['*'] },
          ]
        : platform === 'darwin'
          ? [
              { name: 'Applications', extensions: ['app', 'command', 'exe'] },
              { name: 'Scripts', extensions: ['sh'] },
              { name: 'All files', extensions: ['*'] },
            ]
          : [{ name: 'All files', extensions: ['*'] }];
    const opts: OpenDialogOptions = {
      title: 'Choose executable',
      properties: ['openFile'],
      filters,
    };
    const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (canceled || !filePaths?.length) return null;
    return filePaths[0] ?? null;
  });

  ipcHandle('variables:list', () => {
    if (!isProEnterpriseUnlocked(db)) return [];
    return db.prepare(`SELECT * FROM variables ORDER BY name`).all();
  });

  ipcHandle(
    'variables:create',
    (_e, v: { name: string; type: string; value: string; is_secret?: boolean; scope?: string }) => {
      assertProEnterprise(db);
      db.prepare(`INSERT INTO variables (id, name, type, value, is_secret, scope) VALUES (?, ?, ?, ?, ?, ?)`).run(
        randomUUID(),
        v.name,
        v.type,
        v.value,
        v.is_secret ? 1 : 0,
        v.scope ?? 'global'
      );
      writeAuditLog(db, 'variable.create', v.name);
      return true;
    }
  );

  ipcHandle('variables:update', (_e, v: { id: string; name?: string; type?: string; value?: string; is_secret?: boolean }) => {
    assertProEnterprise(db);
    db.prepare(
      `UPDATE variables SET name = COALESCE(?, name), type = COALESCE(?, type), value = COALESCE(?, value), is_secret = COALESCE(?, is_secret) WHERE id = ?`
    ).run(v.name ?? null, v.type ?? null, v.value ?? null, v.is_secret != null ? (v.is_secret ? 1 : 0) : null, v.id);
    writeAuditLog(db, 'variable.update', v.id);
    return true;
  });

  ipcHandle('variables:delete', (_e, id: string) => {
    assertProEnterprise(db);
    db.prepare(`DELETE FROM variables WHERE id = ?`).run(id);
    writeAuditLog(db, 'variable.delete', id);
    return true;
  });

  ipcHandle('analytics:summary', (_e, opts?: { rangeDays?: number }) => {
    if (!isProEnterpriseUnlocked(db)) {
      return {
        totalRuns: 0,
        successRate: 0,
        avgDurationSec: 0,
        activeWorkflows: 0,
        trends: {
          totalRuns: { label: 'Pro license required', trend: 'flat' as const, favorable: true },
          successRate: { label: 'Pro license required', trend: 'flat' as const, favorable: true },
          avgDurationSec: { label: 'Pro license required', trend: 'flat' as const, favorable: true },
          activeWorkflows: { label: 'Pro license required', trend: 'flat' as const, favorable: true },
        },
      };
    }
    const nd = Math.min(365, Math.max(1, Math.floor(opts?.rangeDays ?? 7)));
    const curr = `datetime(started_at) >= datetime('now', '-${nd} days')`;
    const prev = `datetime(started_at) >= datetime('now', '-${nd * 2} days') AND datetime(started_at) < datetime('now', '-${nd} days')`;
    const touchedCurrClause = `datetime(updated_at) >= datetime('now', '-${nd} days')`;
    const touchedPrevClause = `datetime(updated_at) >= datetime('now', '-${nd * 2} days') AND datetime(updated_at) < datetime('now', '-${nd} days')`;

    const logCount = (where: string) => (db.prepare(`SELECT COUNT(*) as c FROM execution_logs WHERE ${where}`).get() as { c: number }).c;
    const totalRuns = logCount(curr);
    const successRow = db.prepare(`SELECT COUNT(*) as c FROM execution_logs WHERE status = 'success' AND ${curr}`).get() as { c: number };
    const failRow = db.prepare(`SELECT COUNT(*) as c FROM execution_logs WHERE status = 'failure' AND ${curr}`).get() as { c: number };
    const done = successRow.c + failRow.c || 1;
    const successRate = (successRow.c / done) * 100;
    const avgRow = db
      .prepare(
        `SELECT AVG(CAST((julianday(finished_at) - julianday(started_at)) * 86400000 AS INTEGER)) as a FROM execution_logs WHERE finished_at IS NOT NULL AND ${curr}`
      )
      .get() as { a: number | null };
    const active = (db.prepare(`SELECT COUNT(*) as c FROM workflows WHERE enabled = 1`).get() as { c: number }).c;

    const runsCurr = logCount(curr);
    const runsPrev = logCount(prev);

    const rate = (where: string) => {
      const row = db
        .prepare(
          `SELECT 
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as ok,
            SUM(CASE WHEN status IN ('success','failure') THEN 1 ELSE 0 END) as tot
           FROM execution_logs WHERE ${where}`
        )
        .get() as { ok: number | null; tot: number | null };
      const t = row.tot ?? 0;
      if (t === 0) return 0;
      return ((row.ok ?? 0) / t) * 100;
    };
    const successCurr = rate(curr);
    const successPrev = rate(prev);

    const avgMs = (where: string) =>
      (
        db
          .prepare(
            `SELECT AVG(CAST((julianday(finished_at) - julianday(started_at)) * 86400000 AS REAL)) as a 
             FROM execution_logs WHERE finished_at IS NOT NULL AND ${where}`
          )
          .get() as { a: number | null }
      ).a;

    const avgCurr = avgMs(curr);
    const avgPrev = avgMs(prev);

    const touchedCurr = (db.prepare(`SELECT COUNT(*) as c FROM workflows WHERE ${touchedCurrClause}`).get() as { c: number }).c;
    const touchedPrev = (db.prepare(`SELECT COUNT(*) as c FROM workflows WHERE ${touchedPrevClause}`).get() as { c: number }).c;

    const pctChange = (curr: number, prev: number): { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean } => {
      if (prev === 0 && curr === 0) return { label: 'No runs in window', trend: 'flat', favorable: true };
      if (prev === 0)
        return {
          label: curr > 0 ? 'New activity vs prior window' : 'No prior window data',
          trend: curr > 0 ? 'up' : 'flat',
          favorable: true,
        };
      const pct = ((curr - prev) / prev) * 100;
      const rounded = Math.round(pct * 10) / 10;
      const trend: 'up' | 'down' | 'flat' = Math.abs(pct) < 1 ? 'flat' : pct > 0 ? 'up' : 'down';
      return {
        label: `${rounded >= 0 ? '+' : ''}${rounded}% vs prior ${nd}d`,
        trend,
        favorable: trend === 'up' || trend === 'flat',
      };
    };

    const ptsChange = (curr: number, prev: number): { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean } => {
      const d = Math.round((curr - prev) * 10) / 10;
      const trend: 'up' | 'down' | 'flat' = d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat';
      return {
        label: `${d >= 0 ? '+' : ''}${d} pts vs prior ${nd}d`,
        trend,
        favorable: trend === 'up' || trend === 'flat',
      };
    };

    const secChange = (currMs: number | null, prevMs: number | null): { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean } => {
      if (currMs == null && prevMs == null) return { label: 'No duration data', trend: 'flat', favorable: true };
      const c = (currMs ?? 0) / 1000;
      const p = (prevMs ?? 0) / 1000;
      if (p === 0 && c === 0) return { label: 'No duration data', trend: 'flat', favorable: true };
      const d = Math.round((c - p) * 10) / 10;
      const trend: 'up' | 'down' | 'flat' = d < -0.05 ? 'down' : d > 0.05 ? 'up' : 'flat';
      return {
        label: `${d >= 0 ? '+' : ''}${d}s vs prior ${nd}d`,
        trend,
        favorable: trend === 'down' || trend === 'flat',
      };
    };

    return {
      totalRuns,
      successRate: Math.round(successRate * 10) / 10,
      avgDurationSec: avgRow.a != null ? Math.round((avgRow.a / 1000) * 10) / 10 : 0,
      activeWorkflows: active,
      trends: {
        totalRuns: pctChange(runsCurr, runsPrev),
        successRate: ptsChange(successCurr, successPrev),
        avgDurationSec: secChange(avgCurr, avgPrev),
        activeWorkflows: pctChange(touchedCurr, touchedPrev),
      },
    };
  });

  ipcHandle('analytics:runsByWorkflow', (_e, opts?: { rangeDays?: number }) => {
    if (!isProEnterpriseUnlocked(db)) return [];
    const nd = Math.min(365, Math.max(1, Math.floor(opts?.rangeDays ?? 7)));
    const clause = `datetime(e.started_at) >= datetime('now', '-${nd} days')`;
    return db
      .prepare(
        `SELECT w.id, w.name, COUNT(e.id) as run_count
         FROM workflows w
         LEFT JOIN execution_logs e ON e.workflow_id = w.id AND ${clause}
         GROUP BY w.id
         ORDER BY run_count DESC
         LIMIT 10`
      )
      .all();
  });

  ipcHandle('analytics:runsTimeSeries', (_e, opts?: { rangeDays?: number }) => {
    if (!isProEnterpriseUnlocked(db)) return [];
    const nd = Math.min(365, Math.max(1, Math.floor(opts?.rangeDays ?? 30)));
    return db
      .prepare(
        `SELECT date(started_at) as day, COUNT(*) as count
         FROM execution_logs
         WHERE datetime(started_at) >= datetime('now', '-${nd} days')
         GROUP BY date(started_at)
         ORDER BY day ASC`
      )
      .all();
  });

  ipcHandle('analytics:systemHealth', async () => {
    if (!isProEnterpriseUnlocked(db)) return { cpu: 0, memory: 0, queue: 0, storageGb: 0 };
    try {
      const load = await si.currentLoad();
      const mem = await si.mem();
      const fsSize = await si.fsSize();
      const queuedDb = (db.prepare(`SELECT COUNT(*) as c FROM execution_logs WHERE status = 'pending'`).get() as { c: number }).c;
      const queuedMem = engine.getQueuedRunCount();
      const total = mem.total || 1;
      return {
        cpu: Math.round(load.currentLoad ?? 0),
        memory: Math.round((mem.used / total) * 100),
        queue: queuedDb + queuedMem,
        storageGb: fsSize[0] ? Math.round((fsSize[0].used / 1024 / 1024 / 1024) * 10) / 10 : 0,
      };
    } catch {
      return { cpu: 0, memory: 0, queue: 0, storageGb: 0 };
    }
  });

  ipcHandle('engine:runWorkflow', async (_e, workflowId: string) => {
    const logId = await engine.runWorkflow(workflowId, 'manual');
    writeAuditLog(db, 'workflow.run', workflowId);
    return logId;
  });

  ipcHandle('engine:stopWorkflow', () => true);

  ipcHandle('engine:getStatus', () => ({ running: triggers.isEngineReady() }));

  ipcHandle('settings:get', (_e, key: string) => {
    const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? null;
  });

  ipcHandle('settings:set', (_e, payload: { key: string; value: string }) => {
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(payload.key, payload.value);
    writeAuditLog(db, 'settings.set', payload.key);
    return true;
  });

  ipcHandle('team:list', () => {
    if (!isProEnterpriseUnlocked(db)) return [];
    return db.prepare(`SELECT * FROM team_members ORDER BY is_self DESC, display_name`).all();
  });

  ipcHandle(
    'team:invite',
    (_e, payload: { email: string; display_name: string; role: string }) => {
      assertProEnterprise(db);
      const id = randomUUID();
      db.prepare(
        `INSERT INTO team_members (id, email, display_name, role, last_active, workflow_count, is_self) VALUES (?, ?, ?, ?, NULL, 0, 0)`
      ).run(id, payload.email.trim(), payload.display_name.trim(), payload.role);
      writeAuditLog(db, 'team.invite', payload.email);
      return id;
    }
  );

  ipcHandle('team:remove', (_e, id: string) => {
    assertProEnterprise(db);
    const row = db.prepare(`SELECT is_self FROM team_members WHERE id = ?`).get(id) as { is_self: number } | undefined;
    if (!row || row.is_self) return false;
    db.prepare(`DELETE FROM team_members WHERE id = ?`).run(id);
    writeAuditLog(db, 'team.remove', id);
    return true;
  });

  ipcHandle('audit:list', (_e, opts?: { action?: string; userId?: string; q?: string }) => {
    if (!isProEnterpriseUnlocked(db)) return [];
    let sql = `SELECT * FROM audit_logs WHERE 1=1`;
    const args: unknown[] = [];
    if (opts?.action?.trim()) {
      sql += ` AND action LIKE ?`;
      args.push(`%${opts.action.trim()}%`);
    }
    if (opts?.userId?.trim()) {
      sql += ` AND user_id LIKE ?`;
      args.push(`%${opts.userId.trim()}%`);
    }
    if (opts?.q?.trim()) {
      sql += ` AND (resource LIKE ? OR action LIKE ? OR user_id LIKE ?)`;
      const qq = `%${opts.q.trim()}%`;
      args.push(qq, qq, qq);
    }
    sql += ` ORDER BY created_at DESC LIMIT 500`;
    return db.prepare(sql).all(...args);
  });

  ipcHandle('audit:export', async () => {
    assertProEnterprise(db);
    const win = getWin();
    const rows = db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC`).all();
    const dlgOpts = {
      defaultPath: 'taskforge-audit.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    };
    const { filePath } = win ? await dialog.showSaveDialog(win, dlgOpts) : await dialog.showSaveDialog(dlgOpts);
    if (!filePath) return null;
    const header = 'id,user_id,action,resource,ip,status,created_at\n';
    const body = (rows as Record<string, unknown>[])
      .map((r) =>
        [r['id'], r['user_id'], r['action'], r['resource'], r['ip'], r['status'], r['created_at']]
          .map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n');
    fs.writeFileSync(filePath, header + body, 'utf-8');
    return filePath;
  });

  ipcHandle('api:getKey', () => {
    if (!isProEnterpriseUnlocked(db)) return '';
    const row = db.prepare(`SELECT token FROM api_keys WHERE is_primary = 1 LIMIT 1`).get() as { token: string } | undefined;
    if (row?.token) return row.token;
    const fallback = db.prepare(`SELECT value FROM settings WHERE key = 'api_key'`).get() as { value: string } | undefined;
    return fallback?.value ?? '';
  });

  ipcHandle('api:regenerateKey', () => {
    assertProEnterprise(db);
    const key = 'tf_live_' + randomUUID().replace(/-/g, '').slice(0, 24);
    const upd = db.prepare(`UPDATE api_keys SET token = ? WHERE is_primary = 1`).run(key);
    if (upd.changes === 0) {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO api_keys (id, name, token, scopes, created_at, is_primary) VALUES (?, 'Default', ?, '["*"]', ?, 1)`
      ).run(randomUUID(), key, now);
    }
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('api_key', ?)`).run(key);
    writeAuditLog(db, 'api.regenerate_key', 'api_key');
    return key;
  });

  ipcHandle('api:listKeys', () => {
    assertProEnterprise(db);
    const rows = db
      .prepare(`SELECT id, name, scopes, created_at, is_primary FROM api_keys ORDER BY is_primary DESC, created_at ASC`)
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r['id']),
      name: String(r['name']),
      scopes: parseScopesJsonSafe(String(r['scopes'] ?? '[]')),
      created_at: String(r['created_at']),
      is_primary: Boolean(r['is_primary']),
    }));
  });

  ipcHandle('api:createKey', (_e, payload: { name: string; scopes: string[] }) => {
    assertProEnterprise(db);
    const name = String(payload?.name ?? 'API key').trim() || 'API key';
    const scopes = Array.isArray(payload?.scopes) && payload.scopes.length ? payload.scopes : ['*'];
    const token = 'tf_live_' + randomUUID().replace(/-/g, '').slice(0, 24);
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO api_keys (id, name, token, scopes, created_at, is_primary) VALUES (?, ?, ?, ?, ?, 0)`).run(
      id,
      name,
      token,
      JSON.stringify(scopes),
      now
    );
    writeAuditLog(db, 'api.create_key', id);
    return { id, token };
  });

  ipcHandle('api:revokeKey', (_e, keyId: string) => {
    assertProEnterprise(db);
    const row = db.prepare(`SELECT is_primary FROM api_keys WHERE id = ?`).get(keyId) as { is_primary: number } | undefined;
    if (!row || row.is_primary) return false;
    db.prepare(`DELETE FROM api_keys WHERE id = ?`).run(keyId);
    writeAuditLog(db, 'api.revoke_key', keyId);
    return true;
  });

  ipcHandle('marketplace:list', async () => {
    if (!isProEnterpriseUnlocked(db)) return [];
    const catalog = await resolveMarketplaceCatalog(db);
    const installed = db
      .prepare(
        `SELECT source_template_id as id, COUNT(*) as c FROM workflows WHERE source_template_id IS NOT NULL GROUP BY source_template_id`
      )
      .all() as { id: string; c: number }[];
    const map = new Map(installed.map((r) => [r.id, r.c]));
    return catalog.map(({ id, title, author, description, pro }) => ({
      id,
      title,
      author,
      description,
      pro,
      installedCount: map.get(id) ?? 0,
    }));
  });

  ipcHandle('marketplace:install', async (_e, templateId: string) => {
    assertProEnterprise(db);
    const catalog = await resolveMarketplaceCatalog(db);
    const item = findMarketplaceTemplate(catalog, templateId);
    if (!item) return null;
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workflows (id, name, description, enabled, priority, tags, draft, run_count, created_at, updated_at, source_template_id, concurrency)
       VALUES (?, ?, ?, 0, 'normal', ?, 1, 0, ?, ?, ?, 'allow')`
    ).run(id, item.title, item.description, JSON.stringify(['marketplace']), now, now, templateId);
    let order = 0;
    const insN = db.prepare(
      `INSERT INTO workflow_nodes (id, workflow_id, node_type, kind, config, position_x, position_y, sort_order) VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
    );
    for (const n of item.nodes) {
      insN.run(randomUUID(), id, n.node_type, n.kind, JSON.stringify(n.config), order++);
    }
    triggers.reloadFromDatabase();
    writeAuditLog(db, 'marketplace.install', templateId);
    return id;
  });

  ipcHandle(
    'ai:parse',
    async (_e, payload: string | { prompt: string; messages?: AiChatMsg[] }) => {
      assertProEnterprise(db);
      const prompt = typeof payload === 'string' ? payload : String(payload?.prompt ?? '');
      const history = typeof payload === 'object' && payload && Array.isArray(payload.messages) ? payload.messages : undefined;
      const messages = buildWorkflowParseMessages(prompt, history);
      const apiKey = (db.prepare(`SELECT value FROM settings WHERE key = 'openai_api_key'`).get() as { value: string } | undefined)?.value;
      if (!apiKey || isLocalDevOpenAiPlaceholder(apiKey)) {
        return heuristicWorkflowFromPrompt(prompt);
      }
      try {
        const json = await completeWorkflowJson(apiKey, messages);
        return json;
      } catch {
        return heuristicWorkflowFromPrompt(prompt);
      }
    }
  );

  ipcHandle('ai:parseStream', async (_e, payload: { prompt: string; messages?: AiChatMsg[] }) => {
    assertProEnterprise(db);
    const win = getWin();
    const send = (chunk: string) => win?.webContents.send('ai:streamToken', chunk);
    const prompt = String(payload?.prompt ?? '');
    const apiKey = (db.prepare(`SELECT value FROM settings WHERE key = 'openai_api_key'`).get() as { value: string } | undefined)?.value;
    if (!apiKey || isLocalDevOpenAiPlaceholder(apiKey)) {
      const h = heuristicWorkflowFromPrompt(prompt);
      send(JSON.stringify(h));
      return h;
    }
    const messages = buildWorkflowParseMessages(prompt, payload?.messages);
    try {
      const full = await streamWorkflowCompletion(apiKey, messages, (c) => send(c));
      try {
        return parseWorkflowFromModelText(full) as Record<string, unknown>;
      } catch {
        return heuristicWorkflowFromPrompt(prompt);
      }
    } catch {
      return heuristicWorkflowFromPrompt(prompt);
    }
  });

  ipcHandle('data:exportZip', async () => {
    const win = getWin();
    const dlgOpts = {
      defaultPath: 'taskforge-export.zip',
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    };
    const { filePath } = win ? await dialog.showSaveDialog(win, dlgOpts) : await dialog.showSaveDialog(dlgOpts);
    if (!filePath) return null;

    const exportPayload = {
      exported_at: new Date().toISOString(),
      workflows: db.prepare(`SELECT * FROM workflows`).all(),
      workflow_nodes: db.prepare(`SELECT * FROM workflow_nodes`).all(),
      workflow_edges: db.prepare(`SELECT * FROM workflow_edges`).all(),
      variables: db.prepare(`SELECT * FROM variables`).all(),
      settings: db
        .prepare(
          `SELECT key, value FROM settings WHERE key NOT IN ('openai_api_key', 'pro_entitlement_key', 'api_key', 'marketplace_cache_json')`
        )
        .all(),
    };

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', (err: Error) => reject(err));
      archive.pipe(output);
      archive.append(JSON.stringify(exportPayload, null, 2), { name: 'taskforge-data.json' });
      void archive.finalize();
    });
    return filePath;
  });

  ipcHandle('app:getPaths', () => ({
    userData: app.getPath('userData'),
  }));

  ipcHandle('app:getStats', async () => {
    const active = (db.prepare(`SELECT COUNT(*) as c FROM workflows WHERE enabled = 1`).get() as { c: number }).c;
    const queuedDb = (db.prepare(`SELECT COUNT(*) as c FROM execution_logs WHERE status = 'pending'`).get() as { c: number }).c;
    const queue = queuedDb + engine.getQueuedRunCount();
    const triggerCount = (db.prepare(`SELECT COUNT(*) as c FROM workflow_nodes WHERE node_type = 'trigger'`).get() as { c: number }).c;
    const actionCount = (db.prepare(`SELECT COUNT(*) as c FROM workflow_nodes WHERE node_type = 'action'`).get() as { c: number }).c;
    let cpu = 0;
    let memoryMb = 48;
    try {
      const load = await si.currentLoad();
      const mem = await si.mem();
      cpu = Math.round(load.currentLoad ?? 0);
      const proc = process.memoryUsage();
      memoryMb = Math.round(proc.heapUsed / 1024 / 1024);
      void mem;
    } catch {
      /* use defaults */
    }
    return {
      active,
      queue,
      triggerCount,
      actionCount,
      engineRunning: triggers.isEngineReady(),
      cpu,
      memoryMb,
      version: '2.1.0',
    };
  });
}

function heuristicWorkflowFromPrompt(prompt: string): { name: string; nodes: Array<Record<string, unknown>> } {
  if (prompt.trim().length < 6) {
    return {
      name: 'Need more detail',
      nodes: [
        {
          node_type: 'trigger',
          kind: 'time_schedule',
          config: { cron: '0 9 * * *', label: 'Time: 9:00 AM' },
          sort_order: 0,
        },
        {
          node_type: 'action',
          kind: 'show_notification',
          config: {
            title: 'TaskForge',
            body: "I didn't understand that — try describing a trigger and an action separately.",
            label: 'Show Notification',
          },
          sort_order: 1,
        },
      ],
    };
  }

  const lower = prompt.toLowerCase();
  const nodes: Array<Record<string, unknown>> = [];
  let order = 0;

  if (lower.includes('plug in') || lower.includes('usb') || lower.includes('headphone') || lower.includes('device')) {
    nodes.push({
      node_type: 'trigger',
      kind: lower.includes('usb') || lower.includes('plug') ? 'device_trigger' : 'device_connected',
      config: { label: 'Device', device: 'audio', event: 'connect' },
      sort_order: order++,
    });
  } else if (lower.includes('idle')) {
    nodes.push({
      node_type: 'trigger',
      kind: 'idle_trigger',
      config: { idleSeconds: lower.includes('5 min') ? 300 : 600, label: 'When idle' },
      sort_order: order++,
    });
  } else if (lower.includes('memory') || lower.includes('ram')) {
    nodes.push({
      node_type: 'trigger',
      kind: 'memory_trigger',
      config: { threshold: 85, comparison: 'above', label: 'Memory high' },
      sort_order: order++,
    });
  } else if (lower.includes('midnight') || lower.includes('12 am') || lower.includes('12:00 am')) {
    nodes.push({
      node_type: 'trigger',
      kind: 'time_schedule',
      config: { cron: '0 0 * * *', label: 'Daily at midnight' },
      sort_order: order++,
    });
  } else if (lower.includes('startup') || lower.includes('login') || lower.includes('boot')) {
    nodes.push({
      node_type: 'trigger',
      kind: 'system_startup',
      config: { label: 'On startup' },
      sort_order: order++,
    });
  } else if (lower.includes('wifi') || lower.includes('network') || lower.includes('ssid')) {
    nodes.push({
      node_type: 'trigger',
      kind: 'network_change',
      config: { ssid: '', label: 'Network change' },
      sort_order: order++,
    });
  } else if (lower.includes('file') && (lower.includes('change') || lower.includes('watch'))) {
    nodes.push({
      node_type: 'trigger',
      kind: 'file_change',
      config: { path: '', label: 'File change' },
      sort_order: order++,
    });
  } else if (lower.includes('cpu')) {
    nodes.push({
      node_type: 'trigger',
      kind: 'cpu_memory_usage',
      config: { cpuPercent: 90, memPercent: 95, label: 'CPU high' },
      sort_order: order++,
    });
  } else if (lower.includes('morning') || lower.includes('every day') || lower.includes('weekday')) {
    nodes.push({
      node_type: 'trigger',
      kind: 'time_schedule',
      config: { cron: lower.includes('weekday') ? '0 9 * * 1-5' : '0 9 * * *', label: 'Time: 9:00 AM' },
      sort_order: order++,
    });
  } else {
    nodes.push({
      node_type: 'trigger',
      kind: 'time_schedule',
      config: { cron: '0 * * * *', label: 'Time: hourly' },
      sort_order: order++,
    });
  }

  if (lower.includes('chrome')) {
    nodes.push({
      node_type: 'action',
      kind: 'open_application',
      config: { path: 'chrome.exe', label: 'Open Chrome' },
      sort_order: order++,
    });
  } else if (lower.includes('script') || lower.includes('powershell') || lower.includes('shell')) {
    nodes.push({
      node_type: 'action',
      kind: 'run_script',
      config: { path: '', shell: 'powershell', label: 'Run script' },
      sort_order: order++,
    });
  } else if (lower.includes('http') || lower.includes('post ') || lower.includes('request')) {
    nodes.push({
      node_type: 'action',
      kind: 'http_request',
      config: { method: 'GET', url: 'https://example.com', label: 'HTTP request' },
      sort_order: order++,
    });
  } else if (lower.includes('spotify') || lower.includes('app') || lower.includes('open ')) {
    nodes.push({
      node_type: 'action',
      kind: 'open_application',
      config: { path: lower.includes('spotify') ? 'spotify.exe' : 'notepad.exe', label: 'Open application' },
      sort_order: order++,
    });
  } else {
    nodes.push({
      node_type: 'action',
      kind: 'show_notification',
      config: { title: 'TaskForge', body: prompt.slice(0, 120), label: 'Show Notification' },
      sort_order: order++,
    });
  }

  return { name: 'AI Draft: ' + prompt.slice(0, 40), nodes };
}
