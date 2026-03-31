import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

function inv<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
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
    export: () => inv<string | null>('logs:export'),
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
    list: () => inv('audit:list'),
    export: () => inv('audit:export'),
  },
  api: {
    getKey: () => inv('api:getKey'),
    regenerateKey: () => inv('api:regenerateKey'),
  },
  marketplace: {
    list: () => inv('marketplace:list'),
    install: (id: string) => inv('marketplace:install', id),
  },
  ai: {
    parse: (prompt: string) => inv('ai:parse', prompt),
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
