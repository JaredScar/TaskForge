import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/**
 * Sandboxed preload may only `require('electron')` — not sibling `.js` files (see Electron sandbox tutorial).
 * Keep flag + predicate in sync with `ipc-error-envelope.ts`.
 */
const IPC_ERROR_FLAG = '__tfIpcErr' as const;

function isIpcErrorEnvelope(v: unknown): v is { code: string; message: string } {
  return typeof v === 'object' && v !== null && IPC_ERROR_FLAG in v && (v as Record<string, unknown>)[IPC_ERROR_FLAG] === true;
}

function inv<T>(channel: string, ...args: unknown[]): Promise<T> {
  return (async () => {
    const v = await ipcRenderer.invoke(channel, ...args);
    if (isIpcErrorEnvelope(v)) {
      const err = new Error(v.message);
      err.name = 'TaskForgeIpcError';
      (err as Error & { code?: string }).code = v.code;
      throw err;
    }
    return v as T;
  })();
}

contextBridge.exposeInMainWorld('taskForge', {
  workflows: {
    list: () => inv('workflows:list'),
    get: (id: string) => inv('workflows:get', id),
    create: (payload: { name: string; description?: string }) => inv('workflows:create', payload),
    update: (payload: Record<string, unknown>) => inv('workflows:update', payload),
    delete: (id: string) => inv('workflows:delete', id),
    toggle: (id: string) => inv('workflows:toggle', id),
    setEnabled: (payload: { id: string; enabled: boolean }) => inv<boolean>('workflows:setEnabled', payload),
    createFromStarter: (payload: { mode: 'trigger' | 'action'; kind: string; displayTitle: string }) =>
      inv<string>('workflows:createFromStarter', payload),
    appendNode: (payload: { workflowId: string; nodeType: 'trigger' | 'condition' | 'action'; kind: string }) =>
      inv<boolean>('workflows:appendNode', payload),
    duplicate: (id: string) => inv<string>('workflows:duplicate', id),
  },
  catalog: {
    usageByKind: (nodeType: 'trigger' | 'action') =>
      inv<Array<{ kind: string; count: number }>>('catalog:usageByKind', nodeType),
  },
  logs: {
    list: (opts?: { limit?: number; workflowId?: string }) => inv('logs:list', opts),
    get: (id: string) => inv('logs:get', id),
    clear: () => inv('logs:clear'),
    export: (format?: 'csv' | 'json') => inv<string | null>('logs:export', format ?? 'csv'),
    onStepProgress: (cb: (step: Record<string, unknown>) => void) => {
      const handler = (_e: IpcRendererEvent, step: Record<string, unknown>) => cb(step);
      ipcRenderer.on('logs:stepProgress', handler);
      return () => ipcRenderer.removeListener('logs:stepProgress', handler);
    },
  },
  variables: {
    list: () => inv('variables:list'),
    create: (v: Record<string, unknown>) => inv('variables:create', v),
    update: (v: Record<string, unknown>) => inv('variables:update', v),
    delete: (id: string) => inv('variables:delete', id),
  },
  analytics: {
    getSummary: (opts?: { rangeDays?: number }) => inv('analytics:summary', opts),
    getRunsByWorkflow: (opts?: { rangeDays?: number }) => inv('analytics:runsByWorkflow', opts),
    getRunsTimeSeries: (opts?: { rangeDays?: number }) => inv('analytics:runsTimeSeries', opts),
    getSystemHealth: () => inv('analytics:systemHealth'),
  },
  engine: {
    runWorkflow: (id: string) => inv('engine:runWorkflow', id),
    stopWorkflow: () => inv('engine:stopWorkflow'),
    getStatus: () => inv<{ running: boolean }>('engine:getStatus'),
  },
  entitlement: {
    getStatus: () =>
      inv<{ unlocked: boolean; licenseServerConfigured?: boolean; licenseMode?: string }>('entitlement:getStatus'),
    setKey: (key: string) =>
      inv<{ ok: boolean; unlocked: boolean; error?: 'invalid_key' | 'network' }>('entitlement:setKey', key),
    refreshOnline: () => inv<{ ok: boolean; unlocked: boolean; error?: string }>('entitlement:refreshOnline'),
  },
  settings: {
    get: (key: string) => inv('settings:get', key),
    set: (key: string, value: string) => inv('settings:set', { key, value }),
  },
  team: {
    list: () => inv('team:list'),
    invite: (payload: { email: string; display_name: string; role: string }) => inv<string>('team:invite', payload),
    remove: (id: string) => inv<boolean>('team:remove', id),
  },
  audit: {
    list: (opts?: { action?: string; userId?: string; q?: string }) => inv('audit:list', opts),
    export: () => inv('audit:export'),
  },
  api: {
    getKey: () => inv('api:getKey'),
    regenerateKey: () => inv('api:regenerateKey'),
    listKeys: () =>
      inv<Array<{ id: string; name: string; scopes: string[]; created_at: string; is_primary: boolean }>>('api:listKeys'),
    createKey: (payload: { name: string; scopes: string[] }) => inv<{ id: string; token: string }>('api:createKey', payload),
    revokeKey: (id: string) => inv<boolean>('api:revokeKey', id),
  },
  marketplace: {
    list: () => inv('marketplace:list'),
    install: (id: string) => inv('marketplace:install', id),
  },
  ai: {
    parse: (payload: string | { prompt: string; messages?: Array<{ role: string; content: string }> }) =>
      inv<{ name: string; nodes: Array<Record<string, unknown>> }>('ai:parse', payload),
    parseStream: (payload: { prompt: string; messages?: Array<{ role: string; content: string }> }) =>
      inv<{ name: string; nodes: Array<Record<string, unknown>> }>('ai:parseStream', payload),
    onStreamToken: (cb: (chunk: string) => void) => {
      const handler = (_e: IpcRendererEvent, chunk: string) => cb(chunk);
      ipcRenderer.on('ai:streamToken', handler);
      return () => ipcRenderer.removeListener('ai:streamToken', handler);
    },
  },
  data: {
    exportZip: () => inv<string | null>('data:exportZip'),
  },
  dialog: {
    pickExecutable: () => inv<string | null>('dialog:pickExecutable'),
  },
  app: {
    getPaths: () => inv('app:getPaths'),
    getStats: () => inv('app:getStats'),
    onLogsNew: (cb: (payload: { logId: string; workflowId: string }) => void) => {
      const handler = (_e: IpcRendererEvent, payload: { logId: string; workflowId: string }) => cb(payload);
      ipcRenderer.on('logs:new', handler);
      return () => ipcRenderer.removeListener('logs:new', handler);
    },
  },
});
