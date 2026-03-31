import { Injectable } from '@angular/core';
import type { TaskForgeBridge, WorkflowDto } from '../../../types/taskforge-window';
import {
  LOCAL_DEV_OPENAI_API_KEY_PLACEHOLDER,
  LOCAL_DEV_REST_API_KEY_PLACEHOLDER,
} from '../local-dev-keys';

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
];

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
    const mockSettings: Record<string, string> = {
      openai_api_key: LOCAL_DEV_OPENAI_API_KEY_PLACEHOLDER,
    };
    this.mockCached = {
      workflows: {
        list: async () => [...mockWorkflows],
        get: async () => null,
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
          return id;
        },
        update: async () => true,
        delete: async () => true,
        toggle: async () => true,
        setEnabled: async (p) => {
          const w = mockWorkflows.find((x) => x.id === p.id);
          if (w) w.enabled = p.enabled ? 1 : 0;
          return true;
        },
        createFromStarter: async (p) => {
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
        export: async () => null,
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
        runWorkflow: async () => true,
        stopWorkflow: async () => true,
        getStatus: async () => ({ running: true }),
      },
      entitlement: {
        getStatus: async () => ({ unlocked: true, licenseServerConfigured: false, licenseMode: 'local' }),
        setKey: async () => ({ ok: true, unlocked: true }),
        refreshOnline: async () => ({ ok: true, unlocked: true }),
      },
      settings: {
        get: async (key: string) => mockSettings[key] ?? null,
        set: async (key: string, value: string) => {
          mockSettings[key] = value;
          return true;
        },
      },
      team: {
        list: async () => [],
        invite: async () => crypto.randomUUID(),
        remove: async () => true,
      },
      audit: { list: async () => [], export: async () => null },
      api: {
        getKey: async () => LOCAL_DEV_REST_API_KEY_PLACEHOLDER,
        regenerateKey: async () => LOCAL_DEV_REST_API_KEY_PLACEHOLDER,
      },
      marketplace: {
        list: async () => MOCK_MARKETPLACE_LIST.map((m) => ({ ...m, installedCount: 0 })),
        install: async () => null,
      },
      ai: {
        parse: async (prompt) => ({
          name: (prompt.trim().slice(0, 56) || 'Untitled draft').replace(/\s+$/, ''),
          nodes: [],
        }),
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
