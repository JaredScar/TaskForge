import type Database from 'better-sqlite3';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import CronExpressionParser from 'cron-parser';
import * as schedule from 'node-schedule';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import * as si from 'systeminformation';
import { powerMonitor } from 'electron';

const execFileAsync = promisify(execFile);

type TriggerRow = { workflow_id: string; node_id: string; kind: string; config: string };
import type { AutomationEngine } from './automation-engine';
type Scheduled = schedule.Job;
type Watcher = FSWatcher;

function processMatchesConfig(processField: string, procName?: string): boolean {
  if (!procName || !processField.trim()) return false;
  const want = processField.trim().toLowerCase().replace(/\.exe$/i, '');
  const name = procName.toLowerCase();
  const base = name.replace(/\.exe$/i, '');
  return name === want || base === want || name.includes(want) || base.includes(want);
}

export class TriggerManager {
  private readonly jobs = new Map<string, Scheduled>();
  private readonly watchers = new Map<string, Watcher>();
  private readonly intervalTimers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly powerCleanups: Array<() => void> = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastCpu = 0;
  private lastMem = 0;
  private lastUsbCount: number | null = null;
  private readonly lastIdleFire = new Map<string, number>();
  private readonly lastMemTriggerFire = new Map<string, number>();
  private readonly lastPowerEventFire = new Map<string, number>();
  /** Per workflow+node: was the target process running on last poll (app_launch edge detect). */
  private readonly appLaunchWasRunning = new Map<string, boolean>();
  private engineReady = false;

  constructor(
    private readonly db: Database.Database,
    private readonly engine: AutomationEngine
  ) {}

  runStartupTriggers(): void {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT w.id as workflow_id FROM workflows w
         JOIN workflow_nodes n ON n.workflow_id = w.id
         WHERE w.enabled = 1 AND n.node_type = 'trigger' AND n.kind = 'system_startup'`
      )
      .all() as { workflow_id: string }[];
    for (const r of rows) {
      void this.engine.runWorkflow(r.workflow_id, 'system_startup');
    }
  }

  /** True after triggers have been loaded at least once (automation engine is scheduling). */
  isEngineReady(): boolean {
    return this.engineReady;
  }

  reloadFromDatabase(): void {
    this.engineReady = false;
    this.clearAll();
    const rows = this.db
      .prepare(
        `SELECT w.id as workflow_id, n.id as node_id, n.kind, n.config
         FROM workflows w
         JOIN workflow_nodes n ON n.workflow_id = w.id
         WHERE w.enabled = 1 AND n.node_type = 'trigger'`
      )
      .all() as TriggerRow[];

    for (const r of rows) {
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(r.config) as Record<string, unknown>;
      } catch {
        continue;
      }
      const key = `${r.workflow_id}:${r.node_id}`;
      switch (r.kind) {
        case 'time_schedule': {
          const cron = String(config['cron'] ?? '0 9 * * *');
          const job = schedule.scheduleJob(cron, () => {
            void this.engine.runWorkflow(r.workflow_id, 'time_schedule');
            this.recordTriggerFire(r.workflow_id, r.node_id);
          });
          if (job) this.jobs.set(key, job);
          break;
        }
        case 'system_startup':
          break;
        case 'app_launch':
          this.ensurePollLoop();
          break;
        case 'interval_trigger': {
          const mins = Math.max(1, Math.min(24 * 60, Number(config['intervalMinutes'] ?? 30)));
          const ms = mins * 60 * 1000;
          const ikey = `${r.workflow_id}:${r.node_id}`;
          const timer = setInterval(() => {
            void this.engine.runWorkflow(r.workflow_id, 'interval_trigger');
            this.recordTriggerFire(r.workflow_id, r.node_id);
          }, ms);
          this.intervalTimers.set(ikey, timer);
          break;
        }
        case 'power_event':
          break;
        case 'network_change':
          this.startNetworkPoll(r.workflow_id, String(config['ssid'] ?? ''));
          break;
        case 'file_change': {
          const watchPath = String(config['path'] ?? '');
          if (!watchPath) break;
          const w = chokidar.watch(watchPath, { ignoreInitial: true });
          w.on('all', () => {
            void this.engine.runWorkflow(r.workflow_id, 'file_change');
          });
          this.watchers.set(key, w);
          break;
        }
        case 'cpu_memory_usage':
        case 'device_connected':
        case 'idle_trigger':
        case 'memory_trigger':
        case 'device_trigger':
          this.ensurePollLoop();
          break;
        default:
          break;
      }
    }
    this.attachPowerEventListeners(rows);
    this.replayMissedCronIfEnabled(rows);
    this.engineReady = true;
  }

  private getSetting(key: string, defaultVal: string): string {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
    return row?.value ?? defaultVal;
  }

  /**
   * Replay missed cron fires on startup (§16.2).
   * A workflow is eligible if EITHER:
   *   - The global `replay_missed_cron` setting is enabled, OR
   *   - The workflow itself has `replay_missed = 1`
   */
  private replayMissedCronIfEnabled(rows: TriggerRow[]): void {
    const globalOn = this.getSetting('replay_missed_cron', '0');
    const globalEnabled = globalOn === '1' || globalOn === 'true';

    const cronRows = rows.filter((r) => {
      if (r.kind !== 'time_schedule') return false;
      if (globalEnabled) return true;
      try {
        const wf = this.db
          .prepare(`SELECT replay_missed FROM workflows WHERE id = ?`)
          .get(r.workflow_id) as { replay_missed: number } | undefined;
        return (wf?.replay_missed ?? 0) === 1;
      } catch {
        return false;
      }
    });
    for (const r of cronRows) {
      let config: Record<string, unknown> = {};
      try {
        config = JSON.parse(r.config) as Record<string, unknown>;
      } catch {
        continue;
      }
      const cron = String(config['cron'] ?? '0 9 * * *');
      let prevScheduled: Date;
      try {
        const expr = CronExpressionParser.parse(cron, { currentDate: new Date() });
        prevScheduled = expr.prev().toDate();
      } catch {
        continue;
      }

      let lastMs = 0;
      try {
        const st = this.db
          .prepare(`SELECT last_fired_at FROM trigger_state WHERE workflow_id = ? AND trigger_node_id = ?`)
          .get(r.workflow_id, r.node_id) as { last_fired_at: string } | undefined;
        if (st?.last_fired_at) {
          const t = new Date(st.last_fired_at).getTime();
          if (!Number.isNaN(t)) lastMs = t;
        }
      } catch {
        /* no trigger_state */
      }

      if (lastMs < prevScheduled.getTime() - 500) {
        void this.engine.runWorkflow(r.workflow_id, 'time_schedule');
        this.recordTriggerFire(r.workflow_id, r.node_id);
      }
    }
  }

  /** Electron `powerMonitor` events (AC/battery, sleep, lock screen where supported). */
  private attachPowerEventListeners(rows: TriggerRow[]): void {
    for (const off of this.powerCleanups) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this.powerCleanups.length = 0;

    const allowed = new Set([
      'on-ac',
      'on-battery',
      'resume',
      'suspend',
      'lock-screen',
      'unlock-screen',
      'shutdown',
    ]);

    const buckets = new Map<string, { workflow_id: string; node_id: string }[]>();
    for (const r of rows) {
      if (r.kind !== 'power_event') continue;
      let c: Record<string, unknown> = {};
      try {
        c = JSON.parse(r.config) as Record<string, unknown>;
      } catch {
        continue;
      }
      const ev = String(c['event'] ?? 'resume').trim();
      if (!allowed.has(ev)) continue;
      const list = buckets.get(ev) ?? [];
      list.push({ workflow_id: r.workflow_id, node_id: r.node_id });
      buckets.set(ev, list);
    }

    for (const [ev, targets] of buckets) {
      if (targets.length === 0) continue;
      const handler = (): void => {
        const now = Date.now();
        for (const t of targets) {
          const dedupeKey = `${t.workflow_id}:${t.node_id}:${ev}`;
          const last = this.lastPowerEventFire.get(dedupeKey) ?? 0;
          if (now - last < 3_000) continue;
          this.lastPowerEventFire.set(dedupeKey, now);
          void this.engine.runWorkflow(t.workflow_id, 'power_event');
          this.recordTriggerFire(t.workflow_id, t.node_id);
        }
      };
      powerMonitor.on(ev as any, handler);
      this.powerCleanups.push(() => {
        powerMonitor.off(ev as any, handler);
      });
    }
  }

  private recordTriggerFire(workflowId: string, triggerNodeId: string): void {
    try {
      this.db
        .prepare(`INSERT OR REPLACE INTO trigger_state (workflow_id, trigger_node_id, last_fired_at) VALUES (?, ?, ?)`)
        .run(workflowId, triggerNodeId, new Date().toISOString());
    } catch {
      /* older DB without trigger_state */
    }
  }

  private ensurePollLoop(): void {
    if (this.pollTimer) return;
    const raw = (this.db.prepare(`SELECT value FROM settings WHERE key = 'trigger_poll_interval_ms'`).get() as { value: string } | undefined)?.value;
    const intervalMs = Math.max(1000, parseInt(raw ?? '5000', 10) || 5000);
    this.pollTimer = setInterval(() => void this.pollResources(), intervalMs);
  }

  /**
   * Targeted process check — avoids listing every running process.
   * On Windows: uses `tasklist /FI` which filters at the OS level (much lighter than si.processes()).
   * On other platforms: falls back to si.processes() scoped to the specific needle.
   */
  private async isProcessRunning(needle: string): Promise<boolean> {
    if (process.platform === 'win32') {
      try {
        const exeName = needle.trim().toLowerCase().endsWith('.exe') ? needle.trim() : `${needle.trim()}.exe`;
        const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/NH', '/FO', 'CSV']);
        return stdout.toLowerCase().includes(exeName.toLowerCase());
      } catch {
        /* fallback below */
      }
    }
    try {
      const procs = await si.processes();
      return (procs.list ?? []).some((p) => processMatchesConfig(needle, p.name));
    } catch {
      return false;
    }
  }

  private async pollResources(): Promise<void> {
    try {
      const launchRows = this.db
        .prepare(
          `SELECT w.id as workflow_id, n.id as node_id, n.config FROM workflows w
           JOIN workflow_nodes n ON n.workflow_id = w.id
           WHERE w.enabled = 1 AND n.node_type = 'trigger' AND n.kind = 'app_launch'`
        )
        .all() as { workflow_id: string; node_id: string; config: string }[];

      for (const r of launchRows) {
        let c: Record<string, unknown> = {};
        try {
          c = JSON.parse(r.config) as Record<string, unknown>;
        } catch {
          continue;
        }
        const procNeedle = String(c['process'] ?? '');
        if (!procNeedle.trim()) continue;
        const running = await this.isProcessRunning(procNeedle);
        const key = `${r.workflow_id}:${r.node_id}`;
        const was = this.appLaunchWasRunning.get(key) ?? false;
        if (running && !was) {
          void this.engine.runWorkflow(r.workflow_id, 'app_launch');
          this.recordTriggerFire(r.workflow_id, r.node_id);
        }
        this.appLaunchWasRunning.set(key, running);
      }

      const load = await si.currentLoad();
      const mem = await si.mem();
      const cpu = load.currentLoad ?? 0;
      const usedPct = mem.total ? (mem.used / mem.total) * 100 : 0;

      const cpuRows = this.db
        .prepare(
          `SELECT w.id as workflow_id, n.config FROM workflows w
           JOIN workflow_nodes n ON n.workflow_id = w.id
           WHERE w.enabled = 1 AND n.node_type = 'trigger' AND n.kind = 'cpu_memory_usage'`
        )
        .all() as { workflow_id: string; config: string }[];

      for (const r of cpuRows) {
        let c: Record<string, unknown> = {};
        try {
          c = JSON.parse(r.config) as Record<string, unknown>;
        } catch {
          continue;
        }
        const cpuTh = Number(c['cpuPercent'] ?? 90);
        const memTh = Number(c['memPercent'] ?? 90);
        if (cpu >= cpuTh || usedPct >= memTh) {
          if (cpu >= cpuTh && cpu > this.lastCpu + 5) void this.engine.runWorkflow(r.workflow_id, 'cpu_memory_usage');
          else if (usedPct >= memTh && usedPct > this.lastMem + 5) void this.engine.runWorkflow(r.workflow_id, 'cpu_memory_usage');
        }
      }

      this.lastCpu = cpu;
      this.lastMem = usedPct;

      const idleRows = this.db
        .prepare(
          `SELECT w.id as workflow_id, n.config FROM workflows w
           JOIN workflow_nodes n ON n.workflow_id = w.id
           WHERE w.enabled = 1 AND n.node_type = 'trigger' AND n.kind = 'idle_trigger'`
        )
        .all() as { workflow_id: string; config: string }[];

      for (const r of idleRows) {
        let c: Record<string, unknown> = {};
        try {
          c = JSON.parse(r.config) as Record<string, unknown>;
        } catch {
          continue;
        }
        const need = Math.max(1, Number(c['idleSeconds'] ?? 300));
        const idleSec = powerMonitor.getSystemIdleTime();
        if (idleSec >= need) {
          const last = this.lastIdleFire.get(r.workflow_id) ?? 0;
          if (Date.now() - last > 60_000) {
            this.lastIdleFire.set(r.workflow_id, Date.now());
            void this.engine.runWorkflow(r.workflow_id, 'idle_trigger');
          }
        }
      }

      const memTrigRows = this.db
        .prepare(
          `SELECT w.id as workflow_id, n.config FROM workflows w
           JOIN workflow_nodes n ON n.workflow_id = w.id
           WHERE w.enabled = 1 AND n.node_type = 'trigger' AND n.kind = 'memory_trigger'`
        )
        .all() as { workflow_id: string; config: string }[];

      for (const r of memTrigRows) {
        let c: Record<string, unknown> = {};
        try {
          c = JSON.parse(r.config) as Record<string, unknown>;
        } catch {
          continue;
        }
        const th = Number(c['threshold'] ?? 85);
        const below = String(c['comparison'] ?? 'above').toLowerCase() === 'below';
        const ok = below ? usedPct <= th : usedPct >= th;
        if (ok) {
          const last = this.lastMemTriggerFire.get(r.workflow_id) ?? 0;
          if (Date.now() - last > 30_000) {
            this.lastMemTriggerFire.set(r.workflow_id, Date.now());
            void this.engine.runWorkflow(r.workflow_id, 'memory_trigger');
          }
        }
      }

      let usbN = 0;
      try {
        const usb = await si.usb();
        usbN = Array.isArray(usb) ? usb.length : 0;
      } catch {
        usbN = this.lastUsbCount ?? 0;
      }

      const deviceTrigRows = this.db
        .prepare(
          `SELECT DISTINCT w.id as workflow_id FROM workflows w
           JOIN workflow_nodes n ON n.workflow_id = w.id
           WHERE w.enabled = 1 AND n.node_type = 'trigger' AND n.kind = 'device_trigger'`
        )
        .all() as { workflow_id: string }[];

      if (this.lastUsbCount != null && usbN !== this.lastUsbCount && deviceTrigRows.length > 0) {
        for (const r of deviceTrigRows) {
          void this.engine.runWorkflow(r.workflow_id, 'device_trigger');
        }
      }
      this.lastUsbCount = usbN;
    } catch {
      /* ignore poll errors */
    }
  }

  private startNetworkPoll(workflowId: string, expectedSsid: string): void {
    this.ensurePollLoop();
    const key = `net:${workflowId}`;
    if (this.jobs.has(key)) return;
    const job = schedule.scheduleJob('*/5 * * * *', async () => {
      try {
        const wifi = await si.wifiNetworks();
        const match = expectedSsid ? wifi.some((w) => w.ssid === expectedSsid) : wifi.length > 0;
        if (match) void this.engine.runWorkflow(workflowId, 'network_change');
      } catch {
        /* ignore */
      }
    });
    if (job) this.jobs.set(key, job);
  }

  private clearAll(): void {
    for (const j of this.jobs.values()) j.cancel();
    this.jobs.clear();
    for (const w of this.watchers.values()) void w.close();
    this.watchers.clear();
    for (const t of this.intervalTimers.values()) clearInterval(t);
    this.intervalTimers.clear();
    for (const off of this.powerCleanups) {
      try {
        off();
      } catch {
        /* ignore */
      }
    }
    this.powerCleanups.length = 0;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.lastUsbCount = null;
    this.lastIdleFire.clear();
    this.lastMemTriggerFire.clear();
    this.lastPowerEventFire.clear();
    this.appLaunchWasRunning.clear();
  }
}
