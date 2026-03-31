import type Database from 'better-sqlite3';
import * as schedule from 'node-schedule';
import chokidar from 'chokidar';
import type { FSWatcher } from 'chokidar';
import * as si from 'systeminformation';
import { powerMonitor } from 'electron';
import type { AutomationEngine } from './automation-engine';
type Scheduled = schedule.Job;
type Watcher = FSWatcher;

export class TriggerManager {
  private readonly jobs = new Map<string, Scheduled>();
  private readonly watchers = new Map<string, Watcher>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastCpu = 0;
  private lastMem = 0;
  private lastUsbCount: number | null = null;
  private readonly lastIdleFire = new Map<string, number>();
  private readonly lastMemTriggerFire = new Map<string, number>();
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
      .all() as { workflow_id: string; node_id: string; kind: string; config: string }[];

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
          });
          if (job) this.jobs.set(key, job);
          break;
        }
        case 'system_startup':
          break;
        case 'app_launch':
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
    this.engineReady = true;
  }

  private ensurePollLoop(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.pollResources(), 5000);
  }

  private async pollResources(): Promise<void> {
    try {
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
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.lastUsbCount = null;
    this.lastIdleFire.clear();
    this.lastMemTriggerFire.clear();
  }
}
