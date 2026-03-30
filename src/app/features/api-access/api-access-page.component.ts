import { Component, OnInit, inject, signal } from '@angular/core';
import { IpcService } from '../../core/services/ipc.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { LOCAL_DEV_REST_API_KEY_PLACEHOLDER } from '../../core/local-dev-keys';

@Component({
  selector: 'app-api-access-page',
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
        <p class="mt-2 text-xs text-tf-muted">Keep your API key secret. It provides access to trigger workflows on this machine.</p>
      </div>
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
            <tr>
              <td class="p-2 font-mono">POST</td>
              <td class="p-2 font-mono">/v1/workflows/run</td>
              <td class="p-2">Run a workflow by id</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-xs text-tf-muted">Base URL: <code class="text-neutral-400">http://127.0.0.1:38474</code></p>
      <h2 class="mt-8 text-sm font-medium">Example: run workflow</h2>
      <pre class="mt-2 overflow-auto rounded-xl border border-tf-border bg-tf-bg p-4 font-mono text-xs">{{ curlExample() }}</pre>
    </div>
  `,
})
export class ApiAccessPageComponent implements OnInit {
  protected readonly ipc = inject(IpcService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private rawKey = '';
  protected readonly revealed = signal(false);
  protected readonly visibleKey = signal('••••••••••••••••');

  async ngOnInit(): Promise<void> {
    this.rawKey = await this.ipc.api.api.getKey();
    this.visibleKey.set('••••••••••••••••');
    this.revealed.set(false);
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
