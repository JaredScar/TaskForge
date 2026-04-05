import type Database from 'better-sqlite3';
import AdmZip from 'adm-zip';

/** Keys never applied from an import file (secrets and local cache). */
const SETTINGS_IMPORT_BLOCKLIST = new Set([
  'openai_api_key',
  'pro_entitlement_key',
  'api_key',
  'marketplace_cache_json',
]);

export type ImportZipResult =
  | { ok: true; workflows: number; variables: number; settingsApplied: number }
  | { ok: false; error: string };

function asRecordArray(v: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) throw new Error(`Invalid export: "${field}" must be an array`);
  return v as Record<string, unknown>[];
}

/**
 * Replaces all workflows (and related logs via FK cascade), variables, and merges non-secret settings from `taskforge-data.json` in the ZIP.
 */
export function importDataFromZipBuffer(db: Database.Database, buffer: Buffer): ImportZipResult {
  try {
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('taskforge-data.json');
    if (!entry) {
      return { ok: false, error: 'ZIP must contain taskforge-data.json (use TaskForge export).' };
    }
    const raw = entry.getData().toString('utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    const workflows = asRecordArray(data.workflows, 'workflows');
    const workflowNodes = asRecordArray(data.workflow_nodes, 'workflow_nodes');
    const workflowEdges = asRecordArray(data.workflow_edges, 'workflow_edges');
    const variables = asRecordArray(data.variables, 'variables');
    const settingsRows = Array.isArray(data.settings) ? (data.settings as { key?: string; value?: string }[]) : [];

    let settingsApplied = 0;
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM workflows`).run();
      db.prepare(`DELETE FROM variables`).run();

      const insW = db.prepare(
        `INSERT INTO workflows (id, name, description, enabled, priority, tags, draft, run_count, last_run_at, last_run_summary, created_at, updated_at, source_template_id, concurrency)
         VALUES (@id, @name, @description, @enabled, @priority, @tags, @draft, @run_count, @last_run_at, @last_run_summary, @created_at, @updated_at, @source_template_id, @concurrency)`
      );
      for (const w of workflows) {
        const conc = String(w['concurrency'] ?? 'allow');
        const concurrency = ['allow', 'queue', 'skip'].includes(conc) ? conc : 'allow';
        insW.run({
          id: String(w['id']),
          name: String(w['name'] ?? 'Imported'),
          description: String(w['description'] ?? ''),
          enabled: Number(w['enabled'] ?? 1) ? 1 : 0,
          priority: String(w['priority'] ?? 'normal'),
          tags: typeof w['tags'] === 'string' ? w['tags'] : JSON.stringify(w['tags'] ?? []),
          draft: Number(w['draft'] ?? 0) ? 1 : 0,
          run_count: Number(w['run_count'] ?? 0),
          last_run_at: w['last_run_at'] != null ? String(w['last_run_at']) : null,
          last_run_summary: w['last_run_summary'] != null ? String(w['last_run_summary']) : null,
          created_at: String(w['created_at'] ?? new Date().toISOString()),
          updated_at: String(w['updated_at'] ?? new Date().toISOString()),
          source_template_id: w['source_template_id'] != null ? String(w['source_template_id']) : null,
          concurrency,
        });
      }

      const insN = db.prepare(
        `INSERT INTO workflow_nodes (id, workflow_id, node_type, kind, config, position_x, position_y, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const n of workflowNodes) {
        const cfg = n['config'];
        const configStr = typeof cfg === 'string' ? cfg : JSON.stringify(cfg ?? {});
        insN.run(
          String(n['id']),
          String(n['workflow_id']),
          String(n['node_type']),
          String(n['kind']),
          configStr,
          Number(n['position_x'] ?? 0),
          Number(n['position_y'] ?? 0),
          Number(n['sort_order'] ?? 0)
        );
      }

      const insE = db.prepare(
        `INSERT INTO workflow_edges (id, workflow_id, source_node_id, target_node_id) VALUES (?, ?, ?, ?)`
      );
      for (const e of workflowEdges) {
        insE.run(
          String(e['id']),
          String(e['workflow_id']),
          String(e['source_node_id']),
          String(e['target_node_id'])
        );
      }

      const insV = db.prepare(
        `INSERT INTO variables (id, name, type, value, is_secret, scope, description) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const v of variables) {
        insV.run(
          String(v['id']),
          String(v['name']),
          String(v['type'] ?? 'string'),
          String(v['value'] ?? ''),
          Number(v['is_secret'] ?? 0) ? 1 : 0,
          String(v['scope'] ?? 'global'),
          String(v['description'] ?? '').slice(0, 2000)
        );
      }

      const setS = db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`);
      for (const row of settingsRows) {
        const key = row.key != null ? String(row.key) : '';
        if (!key || SETTINGS_IMPORT_BLOCKLIST.has(key)) continue;
        setS.run(key, String(row.value ?? ''));
        settingsApplied += 1;
      }
    });

    tx();

    return {
      ok: true,
      workflows: workflows.length,
      variables: variables.length,
      settingsApplied,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
