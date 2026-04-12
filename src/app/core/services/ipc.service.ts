import { Injectable } from '@angular/core';
import type { TaskForgeBridge, WorkflowDto, WorkflowNodeDto } from '../../../types/taskforge-window';
import {
  LOCAL_DEV_OPENAI_API_KEY_PLACEHOLDER,
  LOCAL_DEV_REST_API_KEY_PLACEHOLDER,
} from '../local-dev-keys';
import { MOCK_WORKFLOW_RUN_LOG_ID } from '../utils/workflow-run-feedback';
import { defaultActionConfig, defaultTriggerConfig } from '../../shared/constants/catalog-defaults';

/** Mirrors built-in templates (browser dev) — same copy as electron/marketplace-data, without node graphs. */
const MOCK_MARKETPLACE_LIST: Array<{ id: string; title: string; author: string; description: string; pro: boolean }> = [
  {
    id: 'tmpl_meeting',
    title: 'Smart Meeting Prep',
    author: 'TaskForge',
    description: 'Example: time-based trigger plus a notification — customize times and message in the builder.',
    pro: false,
  },
  {
    id: 'tmpl_dev',
    title: 'Dev Environment Setup',
    author: 'TaskForge',
    description: 'Example: run actions after login — replace paths with your own apps in the builder.',
    pro: false,
  },
  {
    id: 'tmpl_social',
    title: 'Scheduled HTTP request',
    author: 'TaskForge',
    description: 'Example: POST to a URL on a schedule — set the real endpoint and body in the builder.',
    pro: true,
  },
  {
    id: 'tmpl_db',
    title: 'Database Backup Pro',
    author: 'TaskForge',
    description: 'Example: periodic script run — point to your real backup script path in the builder.',
    pro: true,
  },
  { id: 'tmpl_morning_startup', title: 'Morning Startup Routine', author: 'TaskForge', description: 'Weekday morning apps + notify.', pro: false },
  { id: 'tmpl_clean_downloads', title: 'Clean Downloads (evening)', author: 'TaskForge', description: 'Evening script reminder.', pro: true },
  { id: 'tmpl_shutdown_midnight', title: 'Shutdown reminder', author: 'TaskForge', description: 'Midnight notification.', pro: false },
  { id: 'tmpl_work_login', title: 'Work apps on login', author: 'TaskForge', description: 'Launch mail and chat on login.', pro: false },
  { id: 'tmpl_mute_headphones', title: 'Mute on disconnect (example)', author: 'TaskForge', description: 'Device trigger + audio.', pro: true },
  { id: 'tmpl_dark_evening', title: 'Dark mode evening', author: 'TaskForge', description: 'Dark theme at 7 PM.', pro: false },
  { id: 'tmpl_light_morning', title: 'Light mode morning', author: 'TaskForge', description: 'Light theme at 7 AM.', pro: false },
  { id: 'tmpl_cpu_alert', title: 'High CPU alert', author: 'TaskForge', description: 'CPU threshold + notification.', pro: true },
  { id: 'tmpl_welcome_startup', title: 'Welcome on startup', author: 'TaskForge', description: 'Welcome notification.', pro: false },
  { id: 'tmpl_pomodoro', title: 'Pomodoro break nudge', author: 'TaskForge', description: 'Every 25 minutes — short break reminder.', pro: false },
  { id: 'tmpl_lunch_break', title: 'Lunch break reminder', author: 'TaskForge', description: 'Weekdays at noon — step away from the desk.', pro: false },
  { id: 'tmpl_evening_wrap', title: 'End-of-day wrap-up', author: 'TaskForge', description: 'Weekdays 5:30 PM — save work and close loose ends.', pro: false },
  { id: 'tmpl_stand_reminder', title: 'Stand & stretch (weekdays)', author: 'TaskForge', description: '10 AM and 2 PM — movement reminder.', pro: false },
  { id: 'tmpl_work_hours_only', title: 'Alerts only during work hours', author: 'TaskForge', description: 'Hourly tick with a 9–5 time window condition.', pro: false },
  { id: 'tmpl_open_projects', title: 'Open Projects folder on login', author: 'TaskForge', description: 'Opens a folder after sign-in — set your path.', pro: false },
  { id: 'tmpl_weekly_review', title: 'Weekly review (Monday morning)', author: 'TaskForge', description: 'Monday 9 AM planning nudge.', pro: false },
  { id: 'tmpl_git_friday', title: 'Friday ship reminder', author: 'TaskForge', description: 'Friday 4 PM — commit, push, document.', pro: false },
  { id: 'tmpl_hydration', title: 'Hydration reminder (workdays)', author: 'TaskForge', description: '10 AM & 3 PM weekdays — drink water.', pro: false },
  { id: 'tmpl_wifi_at_home', title: 'When home Wi‑Fi connects', author: 'TaskForge', description: 'SSID match trigger — set your home network name.', pro: true },
  { id: 'tmpl_file_watch_folder', title: 'Folder change alert', author: 'TaskForge', description: 'Notify when files change under a path.', pro: true },
  { id: 'tmpl_idle_stretch', title: 'After idle — stretch reminder', author: 'TaskForge', description: 'Idle threshold then gentle nudge to move.', pro: true },
  { id: 'tmpl_api_healthcheck', title: 'Scheduled API health check', author: 'TaskForge', description: 'GET a URL on a schedule — set your health endpoint.', pro: true },
  { id: 'tmpl_nightly_backup_copy', title: 'Nightly folder copy', author: 'TaskForge', description: 'Daily copy — edit source and destination paths.', pro: true },
  { id: 'tmpl_memory_warning', title: 'High RAM usage alert', author: 'TaskForge', description: 'Memory threshold trigger + notification.', pro: true },
  { id: 'tmpl_cpu_webhook', title: 'CPU spike → webhook POST', author: 'TaskForge', description: 'High CPU threshold then POST to your webhook.', pro: true },
  { id: 'tmpl_memory_webhook', title: 'High RAM → webhook POST', author: 'TaskForge', description: 'Memory trigger then POST to ops or chat.', pro: true },
  { id: 'tmpl_file_change_webhook', title: 'Folder change → webhook', author: 'TaskForge', description: 'File watch then POST to an API.', pro: true },
  { id: 'tmpl_office_wifi_webhook', title: 'Office Wi‑Fi → webhook', author: 'TaskForge', description: 'Corporate SSID match then internal POST.', pro: true },
  { id: 'tmpl_usb_connect_notify_pro', title: 'USB device change (ops alert)', author: 'TaskForge', description: 'USB change trigger + desktop alert.', pro: true },
  { id: 'tmpl_sunday_maintenance_script', title: 'Sunday maintenance script', author: 'TaskForge', description: 'Weekly PowerShell maintenance window.', pro: true },
  { id: 'tmpl_hourly_heartbeat_post', title: 'Hourly heartbeat POST', author: 'TaskForge', description: 'POST JSON each hour for uptime tracking.', pro: true },
  { id: 'tmpl_idle_long_webhook', title: 'Long idle → away webhook', author: 'TaskForge', description: 'Idle threshold then presence webhook.', pro: true },
  { id: 'tmpl_deploy_window_script', title: 'Deploy window (scheduled script)', author: 'TaskForge', description: 'Low-traffic cron + deploy script path.', pro: true },
  { id: 'tmpl_cpu_kill_placeholder', title: 'High CPU → kill runaway app', author: 'TaskForge', description: 'CPU threshold then kill process by name.', pro: true },
  { id: 'tmpl_wifi_then_script', title: 'Home Wi‑Fi → run script', author: 'TaskForge', description: 'Home SSID match then PowerShell sync.', pro: true },
];

function mockUpdatePayloadNodesToDtos(workflowId: string, nodes: unknown[]): WorkflowNodeDto[] {
  return nodes.map((raw, i) => {
    const n = raw as Record<string, unknown>;
    const cfg = n['config'];
    const configStr = typeof cfg === 'string' ? cfg : JSON.stringify(cfg ?? {});
    return {
      id: String(n['id'] ?? crypto.randomUUID()),
      workflow_id: workflowId,
      node_type: String(n['node_type'] ?? ''),
      kind: String(n['kind'] ?? ''),
      config: configStr,
      position_x: Number(n['position_x'] ?? 0),
      position_y: Number(n['position_y'] ?? 0),
      sort_order: Number(n['sort_order'] ?? i),
    };
  });
}

/** Browser-only dev data survives tab close / `ng serve` restart (not used when `window.taskForge` exists). */
const DEV_MOCK_STORE_KEY = 'taskforge_dev_store_v1';

function hydrateDevMockFromStorage(
  mockWorkflows: WorkflowDto[],
  mockWorkflowNodes: Map<string, WorkflowNodeDto[]>
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(DEV_MOCK_STORE_KEY);
    if (!raw) return;
    const j = JSON.parse(raw) as { workflows?: WorkflowDto[]; nodeEntries?: [string, WorkflowNodeDto[]][] };
    if (Array.isArray(j.workflows)) {
      mockWorkflows.splice(0, mockWorkflows.length, ...j.workflows);
    }
    mockWorkflowNodes.clear();
    if (Array.isArray(j.nodeEntries)) {
      for (const entry of j.nodeEntries) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        const [wid, nodes] = entry as [string, WorkflowNodeDto[]];
        if (typeof wid === 'string' && Array.isArray(nodes)) {
          mockWorkflowNodes.set(wid, nodes.map((n) => ({ ...n })));
        }
      }
    }
  } catch {
    /* ignore corrupt */
  }
}

function persistDevMockToStorage(mockWorkflows: WorkflowDto[], mockWorkflowNodes: Map<string, WorkflowNodeDto[]>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const nodeEntries: [string, WorkflowNodeDto[]][] = [...mockWorkflowNodes.entries()].map(([id, nodes]) => [
      id,
      nodes.map((n) => ({ ...n })),
    ]);
    localStorage.setItem(DEV_MOCK_STORE_KEY, JSON.stringify({ workflows: mockWorkflows, nodeEntries }));
  } catch {
    /* quota / private mode */
  }
}

@Injectable({ providedIn: 'root' })
export class IpcService {
  readonly isElectron = typeof window !== 'undefined' && !!window.taskForge;

  private mockCached: TaskForgeBridge | null = null;

  private bridge(): TaskForgeBridge {
    if (!window.taskForge) {
      return this.mockBridge();
    }
    return window.taskForge;
  }

  private mockBridge(): TaskForgeBridge {
    if (this.mockCached) return this.mockCached;
    const mockWorkflows: WorkflowDto[] = [];
    const mockWorkflowNodes = new Map<string, WorkflowNodeDto[]>();
    hydrateDevMockFromStorage(mockWorkflows, mockWorkflowNodes);
    const mockSettings: Record<string, string> = {
      openai_api_key: LOCAL_DEV_OPENAI_API_KEY_PLACEHOLDER,
    };
    this.mockCached = {
      workflows: {
        list: async () => [...mockWorkflows],
        get: async (id: string) => {
          const w = mockWorkflows.find((x) => x.id === id);
          if (!w) return null;
          const nodes = mockWorkflowNodes.get(id);
          return { workflow: w, nodes: nodes ? [...nodes] : [], edges: [] };
        },
        create: async (p) => {
          const id = crypto.randomUUID();
          mockWorkflows.push({
            id,
            name: p.name,
            description: p.description ?? '',
            enabled: 1,
            priority: 'normal',
            tags: '[]',
            draft: 1,
            run_count: 0,
            last_run_at: null,
            last_run_summary: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          mockWorkflowNodes.set(id, []);
          persistDevMockToStorage(mockWorkflows, mockWorkflowNodes);
          return id;
        },
        update: async (payload: Record<string, unknown>) => {
          const id = String(payload['id'] ?? '');
          const w = mockWorkflows.find((x) => x.id === id);
          if (!w) return false;
          if (typeof payload['name'] === 'string') w.name = payload['name'];
          if (payload['description'] !== undefined) w.description = String(payload['description'] ?? '');
          if (payload['draft'] === false) w.draft = 0;
          else if (payload['draft'] === true) w.draft = 1;
          const conc = payload['concurrency'];
          if (conc === 'allow' || conc === 'queue' || conc === 'skip') {
            (w as WorkflowDto & { concurrency?: string }).concurrency = conc;
          }
          const nodes = payload['nodes'];
          if (Array.isArray(nodes)) {
            mockWorkflowNodes.set(id, mockUpdatePayloadNodesToDtos(id, nodes));
          }
          w.updated_at = new Date().toISOString();
          persistDevMockToStorage(mockWorkflows, mockWorkflowNodes);
          return true;
        },
        delete: async (delId: string) => {
          mockWorkflowNodes.delete(delId);
          const idx = mockWorkflows.findIndex((x) => x.id === delId);
          if (idx >= 0) mockWorkflows.splice(idx, 1);
          persistDevMockToStorage(mockWorkflows, mockWorkflowNodes);
          return true;
        },
        toggle: async () => true,
        setEnabled: async (p) => {
          const w = mockWorkflows.find((x) => x.id === p.id);
          if (w) w.enabled = p.enabled ? 1 : 0;
          persistDevMockToStorage(mockWorkflows, mockWorkflowNodes);
          return true;
        },
        setReplayMissed: async (p) => {
          const w = mockWorkflows.find((x) => x.id === p.id);
          if (w) w.replay_missed = p.replayMissed ? 1 : 0;
          persistDevMockToStorage(mockWorkflows, mockWorkflowNodes);
          return true;
        },
        createFromStarter: async (p: { mode: 'trigger' | 'action'; kind: string; displayTitle: string }) => {
          const id = crypto.randomUUID();
          mockWorkflows.push({
            id,
            name: `New · ${p.displayTitle}`,
            description: '',
            enabled: 1,
            priority: 'normal',
            tags: '[]',
            draft: 1,
            run_count: 0,
            last_run_at: null,
            last_run_summary: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          const nodes: WorkflowNodeDto[] = [];
          let order = 0;
          if (p.mode === 'action') {
            nodes.push({
              id: crypto.randomUUID(),
              workflow_id: id,
              node_type: 'trigger',
              kind: 'time_schedule',
              config: JSON.stringify(defaultTriggerConfig('time_schedule')),
              position_x: 0,
              position_y: 0,
              sort_order: order++,
            });
          }
          const cfg = p.mode === 'trigger' ? defaultTriggerConfig(p.kind) : defaultActionConfig(p.kind);
          nodes.push({
            id: crypto.randomUUID(),
            workflow_id: id,
            node_type: p.mode === 'trigger' ? 'trigger' : 'action',
            kind: p.kind,
            config: JSON.stringify(cfg),
            position_x: 0,
            position_y: 0,
            sort_order: order,
          });
          mockWorkflowNodes.set(id, nodes);
          persistDevMockToStorage(mockWorkflows, mockWorkflowNodes);
          return id;
        },
        appendNode: async () => true,
        duplicate: async (id) => {
          const w = mockWorkflows.find((x) => x.id === id);
          if (!w) return '';
          const nid = crypto.randomUUID();
          mockWorkflows.push({
            ...w,
            id: nid,
            name: `Copy of ${w.name}`.slice(0, 200),
            run_count: 0,
            last_run_at: null,
            last_run_summary: null,
            draft: 1,
            updated_at: new Date().toISOString(),
          });
          const src = mockWorkflowNodes.get(id) ?? [];
          mockWorkflowNodes.set(
            nid,
            src.map((n) => ({ ...n, id: crypto.randomUUID(), workflow_id: nid }))
          );
          persistDevMockToStorage(mockWorkflows, mockWorkflowNodes);
          return nid;
        },
      },
      catalog: {
        usageByKind: async () => [],
      },
      logs: {
        list: async () => [],
        get: async () => ({ log: null, steps: [] }),
        clear: async () => true,
        export: async (format?: 'csv' | 'json') => {
          void format;
          return null;
        },
        onStepProgress: () => () => undefined,
      },
      variables: { list: async () => [], create: async () => true, update: async () => true, delete: async () => true },
      analytics: {
        getSummary: async () => ({
          totalRuns: 0,
          successRate: 0,
          avgDurationSec: 0,
          activeWorkflows: 0,
          trends: {
            totalRuns: { label: 'No prior week data', trend: 'flat' as const, favorable: true },
            successRate: { label: 'No prior week data', trend: 'flat' as const, favorable: true },
            avgDurationSec: { label: 'No prior week data', trend: 'flat' as const, favorable: true },
            activeWorkflows: { label: 'No prior week data', trend: 'flat' as const, favorable: true },
          },
        }),
        getRunsByWorkflow: async () => [],
        getRunsTimeSeries: async () => [],
        getSystemHealth: async () => ({ cpu: 0, memory: 0, queue: 0, storageGb: 0 }),
      },
      engine: {
        runWorkflow: async () => MOCK_WORKFLOW_RUN_LOG_ID,
        stopWorkflow: async () => true,
        getStatus: async () => ({ running: true }),
      },
      entitlement: {
        getStatus: async () => ({
          unlocked: true,
          licenseServerConfigured: false,
          licenseMode: 'local',
          seats: undefined,
          licenseValidUntil: null,
          licenseLastVerifiedAt: null,
        }),
        setKey: async () => ({ ok: true, unlocked: true }),
        refreshOnline: async () => ({ ok: true, unlocked: true }),
      },
      settings: {
        get: async (key: string) => mockSettings[key] ?? null,
        set: async (key: string, value: string) => {
          mockSettings[key] = value;
          return true;
        },
        resetPreferences: async () => true,
      },
      team: {
        list: async () => [],
        invite: async () => crypto.randomUUID(),
        remove: async () => true,
      },
      audit: {
        list: async (opts?: {
          action?: string;
          userId?: string;
          q?: string;
          from?: string;
          to?: string;
          status?: string;
        }) => {
          void opts;
          return [];
        },
        export: async () => null,
      },
      dialog: {
        pickExecutable: async () => null,
      },
      api: {
        getKey: async () => LOCAL_DEV_REST_API_KEY_PLACEHOLDER,
        regenerateKey: async () => LOCAL_DEV_REST_API_KEY_PLACEHOLDER,
        listKeys: async () => [
          {
            id: 'mock-primary',
            name: 'Default',
            scopes: ['*'],
            created_at: new Date().toISOString(),
            is_primary: true,
          },
        ],
        createKey: async () => ({ id: crypto.randomUUID(), token: LOCAL_DEV_REST_API_KEY_PLACEHOLDER }),
        revokeKey: async () => true,
      },
      marketplace: {
        list: async () => MOCK_MARKETPLACE_LIST.map((m) => ({ ...m, installedCount: 0 })),
        install: async () => null,
      },
      ai: {
        parse: async (payload) => {
          const prompt = typeof payload === 'string' ? payload : payload.prompt;
          return {
            name: (prompt.trim().slice(0, 56) || 'Untitled draft').replace(/\s+$/, ''),
            nodes: [],
            source: 'heuristic' as const,
            confidence: 0.5,
          };
        },
        parseStream: async (payload) => {
          const prompt = payload.prompt;
          return {
            name: (prompt.trim().slice(0, 56) || 'Untitled draft').replace(/\s+$/, ''),
            nodes: [],
            source: 'heuristic' as const,
            confidence: 0.5,
          };
        },
        onStreamToken: () => () => undefined,
      },
      data: {
        exportZip: async () => null,
        importZip: async () => ({ ok: false as const, error: 'Import is only available in the desktop app.' }),
        clearUserData: async () => true,
      },
      app: {
        getPaths: async () => ({ userData: '' }),
        getStats: async () => ({
          active: 0,
          queue: 0,
          triggerCount: 0,
          actionCount: 0,
          engineRunning: true,
          cpu: 0,
          memoryMb: 48,
          version: '2.1.0',
        }),
        onLogsNew: () => () => undefined,
      },
    };
    return this.mockCached;
  }

  get api(): TaskForgeBridge {
    return this.bridge();
  }
}
