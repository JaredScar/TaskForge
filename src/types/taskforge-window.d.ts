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
  replay_missed?: number;
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

export interface WorkflowEdgeDto {
  id: string;
  workflow_id: string;
  source_node_id: string;
  target_node_id: string;
}

export interface ExecutionLogDto {
  id: string;
  workflow_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger_kind: string | null;
  message: string | null;
  error: string | null;
}

export interface LogStepDto {
  id?: string;
  log_id?: string;
  step_type?: string;
  step_kind: string;
  status: string;
  message: string | null;
  error: string | null;
  output?: string | null;
  duration_ms?: number | null;
}

export interface StepProgressDto {
  logId: string;
  workflowId: string;
  stepIndex: number;
  stepType: string;
  stepKind: string;
  status: string;
  message: string | null;
  error: string | null;
}

export interface VariableDto {
  id: string;
  name: string;
  type: string;
  value: string;
  is_secret: number;
  scope: string;
  description?: string;
}

export interface VariableMutationPayload {
  id?: string;
  name: string;
  type: string;
  value: string;
  is_secret?: boolean | number;
  scope?: string;
  description?: string;
}

export interface TeamMemberDto {
  id: string;
  email: string;
  display_name: string;
  role: string;
  last_active: string | null;
  workflow_count: number;
  is_self: number;
}

export interface AuditLogDto {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  ip: string;
  status: string;
  created_at: string;
}

export interface TaskForgeBridge {
  workflows: {
    list: () => Promise<WorkflowDto[]>;
    get: (id: string) => Promise<{ workflow: WorkflowDto; nodes: WorkflowNodeDto[]; edges: WorkflowEdgeDto[] } | null>;
    create: (p: { name: string; description?: string }) => Promise<string>;
    update: (p: Record<string, unknown>) => Promise<boolean>;
    delete: (id: string) => Promise<boolean>;
    toggle: (id: string) => Promise<boolean>;
    setEnabled: (p: { id: string; enabled: boolean }) => Promise<boolean>;
    setReplayMissed: (p: { id: string; replayMissed: boolean }) => Promise<boolean>;
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
    list: (opts?: { limit?: number; workflowId?: string }) => Promise<ExecutionLogDto[]>;
    get: (id: string) => Promise<{ log: ExecutionLogDto | null; steps: LogStepDto[] }>;
    clear: () => Promise<boolean>;
    export: (format?: 'csv' | 'json') => Promise<string | null>;
    onStepProgress: (cb: (step: StepProgressDto) => void) => () => void;
  };
  variables: {
    list: () => Promise<VariableDto[]>;
    create: (v: VariableMutationPayload) => Promise<boolean>;
    update: (v: VariableMutationPayload & { id: string }) => Promise<boolean>;
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
    /** Empty string if the run was queued behind an in-flight run (`queue` concurrency). */
    runWorkflow: (id: string) => Promise<string>;
    stopWorkflow: () => Promise<boolean>;
    getStatus: () => Promise<{ running: boolean }>;
  };
  entitlement: {
    getStatus: () => Promise<{
      unlocked: boolean;
      licenseServerConfigured?: boolean;
      licenseMode?: string;
      seats?: number;
      licenseValidUntil?: string | null;
      licenseLastVerifiedAt?: string | null;
    }>;
    setKey: (key: string) => Promise<{ ok: boolean; unlocked: boolean; error?: 'invalid_key' | 'network' }>;
    refreshOnline: () => Promise<{ ok: boolean; unlocked: boolean; error?: string }>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<boolean>;
    resetPreferences: () => Promise<boolean>;
  };
  team: {
    list: () => Promise<TeamMemberDto[]>;
    invite: (payload: { email: string; display_name: string; role: string }) => Promise<string>;
    remove: (id: string) => Promise<boolean>;
  };
  audit: {
    list: (opts?: {
      action?: string;
      userId?: string;
      q?: string;
      from?: string;
      to?: string;
      status?: string;
    }) => Promise<AuditLogDto[]>;
    export: () => Promise<string | null>;
  };
  api: {
    getKey: () => Promise<string>;
    regenerateKey: () => Promise<string>;
    listKeys: () => Promise<Array<{ id: string; name: string; scopes: string[]; created_at: string; is_primary: boolean }>>;
    createKey: (payload: { name: string; scopes: string[] }) => Promise<{ id: string; token: string }>;
    revokeKey: (id: string) => Promise<boolean>;
  };
  marketplace: {
    list: () => Promise<
      Array<{ id: string; title: string; author: string; description: string; pro: boolean; installedCount: number }>
    >;
    install: (id: string) => Promise<string | null>;
  };
  ai: {
    parse: (payload: string | { prompt: string; messages?: Array<{ role: string; content: string }> }) => Promise<{
      name: string;
      nodes: Array<Record<string, unknown>>;
      source?: 'heuristic' | 'model';
      confidence?: number;
    }>;
    parseStream: (payload: { prompt: string; messages?: Array<{ role: string; content: string }> }) => Promise<{
      name: string;
      nodes: Array<Record<string, unknown>>;
      source?: 'heuristic' | 'model';
      confidence?: number;
    }>;
    onStreamToken: (cb: (chunk: string) => void) => () => void;
  };
  data: {
    exportZip: () => Promise<string | null>;
    importZip: () => Promise<
      | { ok: true; workflows: number; variables: number; settingsApplied: number }
      | { ok: false; error: string }
    >;
    clearUserData: () => Promise<boolean>;
  };
  dialog: {
    /** Native open-file dialog; returns absolute path or `null` if cancelled. */
    pickExecutable: () => Promise<string | null>;
  };
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
