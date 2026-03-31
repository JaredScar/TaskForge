export interface WorkflowDto {
  id: string;
  name: string;
  description: string;
  enabled: number;
  priority: string;
  tags: string;
  draft: number;
  run_count: number;
  last_run_at: string | null;
  last_run_summary: string | null;
  created_at: string;
  updated_at: string;
  source_template_id?: string | null;
  concurrency?: string | null;
}

export interface WorkflowNodeDto {
  id: string;
  workflow_id: string;
  node_type: string;
  kind: string;
  config: string;
  position_x: number;
  position_y: number;
  sort_order: number;
}

export interface TaskForgeBridge {
  workflows: {
    list: () => Promise<WorkflowDto[]>;
    get: (id: string) => Promise<{ workflow: WorkflowDto; nodes: WorkflowNodeDto[]; edges: unknown[] } | null>;
    create: (p: { name: string; description?: string }) => Promise<string>;
    update: (p: Record<string, unknown>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    toggle: (id: string) => Promise<boolean>;
    setEnabled: (p: { id: string; enabled: boolean }) => Promise<boolean>;
    createFromStarter: (p: { mode: 'trigger' | 'action'; kind: string; displayTitle: string }) => Promise<string>;
    appendNode: (p: {
      workflowId: string;
      nodeType: 'trigger' | 'condition' | 'action';
      kind: string;
    }) => Promise<boolean>;
    duplicate: (id: string) => Promise<string>;
  };
  catalog: {
    usageByKind: (nodeType: 'trigger' | 'action') => Promise<Array<{ kind: string; count: number }>>;
  };
  logs: {
    list: (opts?: { limit?: number; workflowId?: string }) => Promise<unknown[]>;
    get: (id: string) => Promise<{ log: unknown; steps: unknown[] }>;
    clear: () => Promise<boolean>;
    export: () => Promise<string | null>;
  };
  variables: {
    list: () => Promise<unknown[]>;
    create: (v: Record<string, unknown>) => Promise<boolean>;
    update: (v: Record<string, unknown>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
  };
  analytics: {
    getSummary: (opts?: { rangeDays?: number }) => Promise<{
      totalRuns: number;
      successRate: number;
      avgDurationSec: number;
      activeWorkflows: number;
      trends: {
        totalRuns: { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean };
        successRate: { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean };
        avgDurationSec: { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean };
        activeWorkflows: { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean };
      };
    }>;
    getRunsByWorkflow: (opts?: { rangeDays?: number }) => Promise<Array<{ id: string; name: string; run_count: number }>>;
    getRunsTimeSeries: (opts?: { rangeDays?: number }) => Promise<Array<{ day: string; count: number }>>;
    getSystemHealth: () => Promise<{ cpu: number; memory: number; queue: number; storageGb: number }>;
  };
  engine: {
    runWorkflow: (id: string) => Promise<boolean>;
    stopWorkflow: () => Promise<boolean>;
    getStatus: () => Promise<{ running: boolean }>;
  };
  entitlement: {
    getStatus: () => Promise<{ unlocked: boolean; licenseServerConfigured?: boolean; licenseMode?: string }>;
    setKey: (key: string) => Promise<{ ok: boolean; unlocked: boolean; error?: 'invalid_key' | 'network' }>;
    refreshOnline: () => Promise<{ ok: boolean; unlocked: boolean; error?: string }>;
  };
  settings: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<boolean> };
  team: {
    list: () => Promise<unknown[]>;
    invite: (payload: { email: string; display_name: string; role: string }) => Promise<string>;
    remove: (id: string) => Promise<boolean>;
  };
  audit: { list: () => Promise<unknown[]>; export: () => Promise<string | null> };
  api: { getKey: () => Promise<string>; regenerateKey: () => Promise<string> };
  marketplace: {
    list: () => Promise<
      Array<{ id: string; title: string; author: string; description: string; pro: boolean; installedCount: number }>
    >;
    install: (id: string) => Promise<string | null>;
  };
  ai: { parse: (prompt: string) => Promise<{ name: string; nodes: Array<Record<string, unknown>> }> };
  app: {
    getPaths: () => Promise<{ userData: string }>;
    getStats: () => Promise<{
      active: number;
      queue: number;
      triggerCount: number;
      actionCount: number;
      engineRunning: boolean;
      cpu: number;
      memoryMb: number;
      version: string;
    }>;
    onLogsNew: (cb: (payload: { logId: string; workflowId: string }) => void) => () => void;
  };
}

declare global {
  interface Window {
    taskForge?: TaskForgeBridge;
  }
}

export {};
