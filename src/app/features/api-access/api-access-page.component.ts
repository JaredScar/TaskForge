import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IpcService } from '../../core/services/ipc.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { LOCAL_DEV_REST_API_KEY_PLACEHOLDER } from '../../core/local-dev-keys';

const SCOPE_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'workflows:read', label: 'List & read workflows' },
  { id: 'workflows:write', label: 'Create workflows (POST /v1/workflows)' },
  { id: 'workflows:run', label: 'Run workflows (POST /v1/workflows/run)' },
  { id: 'logs:read', label: 'Read execution logs' },
  { id: 'variables:read', label: 'Read non-secret variables' },
];

@Component({
  selector: 'app-api-access-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-2xl">
      <h1 class="text-xl font-semibold">API Access</h1>
      <p class="mt-1 text-sm text-tf-muted">Trigger workflows programmatically via REST API</p>
      @if (!ipc.isElectron) {
        <p class="mt-2 text-xs text-amber-200/90">
          Browser preview: the key below is a <strong>dummy</strong> for layout. With <strong>unpackaged</strong> Electron, the same value works for
          <code class="text-[11px]">curl</code> to <code class="text-[11px]">127.0.0.1:38474</code>; packaged builds use the real key from SQLite.
        </p>
      }
      <div class="mt-6 rounded-xl border border-tf-border bg-tf-card p-4">
        <div class="flex flex-wrap items-center gap-2">
          <code class="min-w-0 flex-1 truncate rounded-lg bg-tf-bg px-3 py-2 font-mono text-xs">{{ visibleKey() }}</code>
          <button type="button" class="rounded-lg border border-tf-border px-3 py-2 text-xs" (click)="toggleReveal()">
            {{ revealed() ? 'Hide' : 'Show' }}
          </button>
          <button type="button" class="rounded-lg border border-tf-border px-3 py-2 text-xs" (click)="copy()">Copy</button>
          <button type="button" class="rounded-lg border border-tf-border px-3 py-2 text-xs" (click)="regen()">Regenerate</button>
        </div>
        <p class="mt-2 text-xs text-tf-muted">
          Keep your primary key secret. It has full access (<code class="text-[10px] text-neutral-500">*</code> scope). Additional keys below can be
          limited to specific operations.
        </p>
      </div>

      <h2 class="mt-8 text-sm font-medium">Scoped API keys</h2>
      <p class="mt-1 text-xs text-tf-muted">Optional keys with restricted permissions for scripts and integrations.</p>
      <div class="mt-3 rounded-xl border border-tf-border bg-tf-card p-4">
        <label class="text-xs text-tf-muted">Name</label>
        <input
          [(ngModel)]="newKeyName"
          class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
          placeholder="e.g. CI runner"
        />
        <p class="mt-3 text-xs font-medium text-tf-muted">Scopes</p>
        <label class="mt-2 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="newKeyFullAccess" (ngModelChange)="onFullAccessChange($event)" />
          Full access (same as primary)
        </label>
        @if (!newKeyFullAccess()) {
          <div class="mt-2 space-y-2 pl-1">
            @for (opt of scopeOptions; track opt.id) {
              <label class="flex items-center gap-2 text-sm text-neutral-300">
                <input type="checkbox" [checked]="newKeyScopes().has(opt.id)" (change)="toggleScope(opt.id, $event)" />
                {{ opt.label }}
              </label>
            }
          </div>
        }
        <button type="button" (click)="createScopedKey()" class="mt-4 rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black">
          Create key
        </button>
        @if (lastCreatedToken()) {
          <p class="mt-3 text-xs text-amber-200">Copy this token now — it will not be shown again:</p>
          <code class="mt-1 block break-all rounded-lg bg-tf-bg px-3 py-2 font-mono text-[11px]">{{ lastCreatedToken() }}</code>
        }
      </div>

      @if (extraKeys().length > 0) {
        <div class="mt-4 overflow-x-auto rounded-xl border border-tf-border">
          <table class="w-full min-w-[20rem] text-left text-xs">
            <thead class="border-b border-tf-border bg-tf-card text-tf-muted">
              <tr>
                <th class="p-2">Name</th>
                <th class="p-2">Scopes</th>
                <th class="p-2"></th>
              </tr>
            </thead>
            <tbody class="text-neutral-300">
              @for (k of extraKeys(); track k.id) {
                <tr class="border-b border-tf-border/60">
                  <td class="p-2">{{ k.name }}</td>
                  <td class="p-2 font-mono text-[10px] text-neutral-500">{{ k.scopes.join(', ') || '—' }}</td>
                  <td class="p-2 text-right">
                    <button type="button" class="text-red-400 hover:underline" (click)="revoke(k.id)">Revoke</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <h2 class="mt-8 text-sm font-medium">Endpoints (Bearer token)</h2>
      <div class="mt-2 overflow-x-auto rounded-xl border border-tf-border">
        <table class="w-full min-w-[28rem] text-left text-xs">
          <thead class="border-b border-tf-border bg-tf-card text-tf-muted">
            <tr>
              <th class="p-2 font-medium">Method</th>
              <th class="p-2 font-medium">Path</th>
              <th class="p-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody class="text-neutral-300">
            <tr class="border-b border-tf-border/60">
              <td class="p-2 font-mono">GET</td>
              <td class="p-2 font-mono">/v1/workflows</td>
              <td class="p-2">List workflows</td>
            </tr>
            <tr class="border-b border-tf-border/60">
              <td class="p-2 font-mono">GET</td>
              <td class="p-2 font-mono">/v1/workflows/:id</td>
              <td class="p-2">Workflow with nodes and edges</td>
            </tr>
            <tr class="border-b border-tf-border/60">
              <td class="p-2 font-mono">GET</td>
              <td class="p-2 font-mono">/v1/logs</td>
              <td class="p-2">Recent execution logs</td>
            </tr>
            <tr class="border-b border-tf-border/60">
              <td class="p-2 font-mono">GET</td>
              <td class="p-2 font-mono">/v1/logs/:id</td>
              <td class="p-2">Log detail with steps</td>
            </tr>
            <tr class="border-b border-tf-border/60">
              <td class="p-2 font-mono">GET</td>
              <td class="p-2 font-mono">/v1/variables</td>
              <td class="p-2">Non-secret variables (id, name, type, value, scope)</td>
            </tr>
            <tr>
              <td class="p-2 font-mono">POST</td>
              <td class="p-2 font-mono">/v1/workflows/run</td>
              <td class="p-2">Run a workflow by id — requires <code class="text-[10px]">workflows:run</code> or <code class="text-[10px]">*</code></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-tf-muted">Base URL: <code class="text-neutral-400">http://127.0.0.1:38474</code></p>
      <p class="mt-1 text-xs text-tf-muted">
        Each endpoint checks scopes: GET workflows → <code class="text-[10px]">workflows:read</code>; GET logs →
        <code class="text-[10px]">logs:read</code>; GET variables → <code class="text-[10px]">variables:read</code>.
      </p>
      <h2 class="mt-8 text-sm font-medium">Example: run workflow</h2>
      <pre class="mt-2 overflow-auto rounded-xl border border-tf-border bg-tf-bg p-4 font-mono text-xs">{{ curlExample() }}</pre>
    </div>
  `,
})
export class ApiAccessPageComponent implements OnInit {
  protected readonly ipc = inject(IpcService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  protected readonly scopeOptions = SCOPE_OPTIONS;
  private rawKey = '';
  protected readonly revealed = signal(false);
  protected readonly visibleKey = signal('••••••••••••••••');
  protected readonly extraKeys = signal<Array<{ id: string; name: string; scopes: string[] }>>([]);
  protected newKeyName = '';
  protected readonly newKeyFullAccess = signal(true);
  protected readonly newKeyScopes = signal<Set<string>>(new Set());
  protected readonly lastCreatedToken = signal('');

  async ngOnInit(): Promise<void> {
    this.rawKey = await this.ipc.api.api.getKey();
    this.visibleKey.set('••••••••••••••••');
    this.revealed.set(false);
    await this.reloadKeyList();
  }

  private async reloadKeyList(): Promise<void> {
    try {
      const rows = await this.ipc.api.api.listKeys();
      this.extraKeys.set(rows.filter((r) => !r.is_primary).map((r) => ({ id: r.id, name: r.name, scopes: r.scopes })));
    } catch {
      this.extraKeys.set([]);
    }
  }

  protected onFullAccessChange(v: boolean): void {
    this.newKeyFullAccess.set(v);
  }

  protected toggleScope(id: string, ev: Event): void {
    const c = ev.target as HTMLInputElement;
    const next = new Set(this.newKeyScopes());
    if (c.checked) next.add(id);
    else next.delete(id);
    this.newKeyScopes.set(next);
  }

  async createScopedKey(): Promise<void> {
    this.lastCreatedToken.set('');
    const name = this.newKeyName.trim() || 'API key';
    const scopes = this.newKeyFullAccess()
      ? ['*']
      : [...this.newKeyScopes()];
    if (!this.newKeyFullAccess() && scopes.length === 0) {
      this.toast.warning('Select at least one scope or use full access.');
      return;
    }
    try {
      const r = await this.ipc.api.api.createKey({ name, scopes });
      this.lastCreatedToken.set(r.token);
      this.newKeyName = '';
      await this.reloadKeyList();
      this.toast.success('API key created');
    } catch {
      this.toast.error('Could not create key');
    }
  }

  async revoke(id: string): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Revoke API key',
      message: 'Scripts using this token will fail immediately.',
      confirmLabel: 'Revoke',
    });
    if (!ok) return;
    try {
      await this.ipc.api.api.revokeKey(id);
      await this.reloadKeyList();
      this.toast.info('Key revoked');
    } catch {
      this.toast.error('Could not revoke key');
    }
  }

  protected toggleReveal(): void {
    const next = !this.revealed();
    this.revealed.set(next);
    this.visibleKey.set(next ? this.rawKey : '••••••••••••••••');
  }

  async copy(): Promise<void> {
    await navigator.clipboard.writeText(this.rawKey);
  }

  async regen(): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Regenerate API key',
      message: 'The current key will stop working immediately. Update any scripts or integrations that use it.',
      confirmLabel: 'Regenerate',
    });
    if (!ok) return;
    this.rawKey = await this.ipc.api.api.regenerateKey();
    this.revealed.set(true);
    this.visibleKey.set(this.rawKey);
  }

  protected curlExample(): string {
    const k = this.rawKey || LOCAL_DEV_REST_API_KEY_PLACEHOLDER;
    return `curl -X POST http://127.0.0.1:38474/v1/workflows/run \\
  -H "Authorization: Bearer ${k}" \\
  -H "Content-Type: application/json" \\
  -d '{"workflow_id":"wf_abc123","params":{}}'`;
  }
}
