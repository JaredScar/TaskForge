/**
 * IPC invoke contract — keep channel names aligned with `electron/ipc-handlers.ts` and `electron/preload.ts`.
 * PLAN §19.1: shared typing for renderer; main process uses the same string literals in `ipcHandle('…', …)`.
 */
import type { WorkflowDto, WorkflowNodeDto } from './taskforge-window';

export type AppStats = {
  active: number;
  queue: number;
  triggerCount: number;
  actionCount: number;
  engineRunning: boolean;
  cpu: number;
  memoryMb: number;
  version: string;
};

export type AnalyticsSummaryDto = {
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
};

export type AiDraftResult = { name: string; nodes: Array<Record<string, unknown>> };

/** Maps `ipcMain.handle` channel name → request args (after `event`) and response type. */
export interface IpcInvokeMap {
  'entitlement:getStatus': { req: []; res: { unlocked: boolean; licenseServerConfigured?: boolean; licenseMode?: string } };
  'entitlement:refreshOnline': { req: []; res: { ok: boolean; unlocked: boolean; error?: string } };
  'entitlement:setKey': { req: [key: string]; res: { ok: boolean; unlocked: boolean; error?: 'invalid_key' | 'network' } };
  'workflows:list': { req: []; res: WorkflowDto[] };
  'workflows:get': { req: [id: string]; res: { workflow: WorkflowDto; nodes: WorkflowNodeDto[]; edges: unknown[] } | null };
  'workflows:create': { req: [payload: { name: string; description?: string }]; res: string };
  'workflows:update': { req: [payload: Record<string, unknown>]; res: boolean };
  'workflows:delete': { req: [id: string]; res: boolean };
  'workflows:toggle': { req: [id: string]; res: boolean };
  'workflows:setEnabled': { req: [payload: { id: string; enabled: boolean }]; res: boolean };
  'workflows:duplicate': { req: [id: string]; res: string };
  'workflows:createFromStarter': {
    req: [payload: { mode: 'trigger' | 'action'; kind: string; displayTitle: string }];
    res: string;
  };
  'workflows:appendNode': {
    req: [payload: { workflowId: string; nodeType: 'trigger' | 'condition' | 'action'; kind: string }];
    res: boolean;
  };
  'catalog:usageByKind': { req: [nodeType: 'trigger' | 'action']; res: Array<{ kind: string; count: number }> };
  'logs:list': { req: [opts?: { limit?: number; workflowId?: string }]; res: unknown[] };
  'logs:get': { req: [id: string]; res: { log: unknown; steps: unknown[] } };
  'logs:clear': { req: []; res: boolean };
  'logs:export': { req: [format?: 'csv' | 'json']; res: string | null };
  'dialog:pickExecutable': { req: []; res: string | null };
  'variables:list': { req: []; res: unknown[] };
  'variables:create': { req: [v: Record<string, unknown>]; res: boolean };
  'variables:update': { req: [v: Record<string, unknown>]; res: boolean };
  'variables:delete': { req: [id: string]; res: boolean };
  'analytics:summary': { req: [opts?: { rangeDays?: number }]; res: AnalyticsSummaryDto };
  'analytics:runsByWorkflow': {
    req: [opts?: { rangeDays?: number }];
    res: Array<{ id: string; name: string; run_count: number }>;
  };
  'analytics:runsTimeSeries': { req: [opts?: { rangeDays?: number }]; res: Array<{ day: string; count: number }> };
  'analytics:systemHealth': { req: []; res: { cpu: number; memory: number; queue: number; storageGb: number } };
  'engine:runWorkflow': { req: [workflowId: string]; res: string };
  'engine:stopWorkflow': { req: []; res: boolean };
  'engine:getStatus': { req: []; res: { running: boolean } };
  'settings:get': { req: [key: string]; res: string | null };
  'settings:set': { req: [payload: { key: string; value: string }]; res: boolean };
  'team:list': { req: []; res: unknown[] };
  'team:invite': { req: [payload: { email: string; display_name: string; role: string }]; res: string };
  'team:remove': { req: [id: string]; res: boolean };
  'audit:list': { req: [opts?: { action?: string; userId?: string; q?: string }]; res: unknown[] };
  'audit:export': { req: []; res: string | null };
  'api:getKey': { req: []; res: string };
  'api:regenerateKey': { req: []; res: string };
  'api:listKeys': {
    req: [];
    res: Array<{ id: string; name: string; scopes: string[]; created_at: string; is_primary: boolean }>;
  };
  'api:createKey': { req: [payload: { name: string; scopes: string[] }]; res: { id: string; token: string } };
  'api:revokeKey': { req: [id: string]; res: boolean };
  'marketplace:list': {
    req: [];
    res: Array<{ id: string; title: string; author: string; description: string; pro: boolean; installedCount: number }>;
  };
  'marketplace:install': { req: [templateId: string]; res: string | null };
  'ai:parse': { req: [payload: string | { prompt: string; messages?: Array<{ role: string; content: string }> }]; res: AiDraftResult };
  'ai:parseStream': {
    req: [payload: { prompt: string; messages?: Array<{ role: string; content: string }> }];
    res: AiDraftResult;
  };
  'data:exportZip': { req: []; res: string | null };
  'app:getPaths': { req: []; res: { userData: string } };
  'app:getStats': { req: []; res: AppStats };
}

export type IpcChannel = keyof IpcInvokeMap;
