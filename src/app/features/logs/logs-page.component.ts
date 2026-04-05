import { Component, DestroyRef, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

interface LogStepRow {
  step_kind: string;
  status: string;
  message: string | null;
  error: string | null;
}

interface LogRow {
  id: string;
  workflow_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  message: string | null;
  error: string | null;
  workflow_name: string;
  steps?: LogStepRow[];
}

@Component({
  selector: 'app-logs-page',
  imports: [FormsModule, EmptyStateComponent],
  template: `
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold">Execution logs</h1>
        <div class="flex flex-wrap gap-2">
          <input
            type="search"
            data-tf-focus-search
            [ngModel]="filter()"
            (ngModelChange)="onFilterChange($event)"
            placeholder="Filter…"
            class="h-9 rounded-lg border border-tf-border bg-tf-card px-3 text-sm outline-none focus:ring-1 focus:ring-tf-green"
          />
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="onStatusChange($event)"
            class="h-9 rounded-lg border border-tf-border bg-tf-card px-2 text-sm outline-none focus:ring-1 focus:ring-tf-green"
          >
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
            <option value="running">Running</option>
            <option value="skipped">Skipped</option>
          </select>
          <button
            type="button"
            (click)="exportLogs('csv')"
            class="h-9 rounded-lg border border-tf-border px-3 text-sm hover:bg-neutral-800"
          >
            Export CSV
          </button>
          <button
            type="button"
            (click)="exportLogs('json')"
            class="h-9 rounded-lg border border-tf-border px-3 text-sm hover:bg-neutral-800"
          >
            Export JSON
          </button>
          <button type="button" (click)="clear()" class="h-9 rounded-lg border border-tf-border px-3 text-sm hover:bg-neutral-800">
            Clear all
          </button>
        </div>
      </div>
      @if (rows().length === 0) {
        <app-empty-state
          icon="📜"
          title="No execution logs yet"
          description="Run a workflow from the Workflows page or wait for a scheduled trigger. New runs appear here automatically."
          ctaLabel="Go to workflows"
          ctaRoute="/workflows"
        />
      } @else if (filteredRows().length === 0) {
        <p class="mt-4 rounded-lg border border-tf-border bg-tf-card px-4 py-8 text-center text-sm text-tf-muted">
          No logs match your filter. Try clearing the search or status filter.
        </p>
      } @else {
      <div class="mt-4 overflow-hidden rounded-xl border border-tf-border">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-tf-border bg-tf-card text-xs text-tf-muted">
            <tr>
              <th class="p-3">Time</th>
              <th class="p-3">Workflow</th>
              <th class="p-3">Status</th>
              <th class="p-3">Message</th>
              <th class="p-3 text-right">Duration</th>
              <th class="w-10 p-3"></th>
            </tr>
          </thead>
          <tbody>
            @for (row of filteredRows(); track row.id) {
              <tr class="border-b border-tf-border/60 hover:bg-tf-card/50">
                <td class="p-3 font-mono text-xs text-tf-muted">{{ row.started_at.slice(11, 19) }}</td>
                <td class="p-3">
                  <span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs">{{ row.workflow_name }}</span>
                </td>
                <td class="p-3">{{ statusIcon(row.status) }}</td>
                <td class="p-3 text-xs text-neutral-300">{{ row.message || row.error || '—' }}</td>
                <td class="p-3 text-right text-xs text-tf-muted">{{ duration(row) }}</td>
                <td class="p-3">
                  <button type="button" class="text-tf-muted hover:text-white" (click)="toggle(row.id)">
                    {{ expanded().has(row.id) ? '▼' : '▶' }}
                  </button>
                </td>
              </tr>
              @if (expanded().has(row.id)) {
                <tr class="bg-tf-card/30">
                  <td colspan="6" class="p-4 font-mono text-xs text-neutral-400">
                    @if (row.steps?.length) {
                      @for (s of row.steps; track $index) {
                        <div class="py-1">
                          {{ s.step_kind }} — {{ s.status }} — {{ s.message }}
                          @if (s.error) {
                            <span class="text-red-400"> — {{ s.error }}</span>
                          }
                        </div>
                      }
                    } @else {
                      Loading steps…
                    }
                  </td>
                </tr>
              }
            }
          </tbody>
        </table>
      </div>
      }
    </div>
  `,
})
export class LogsPageComponent implements OnInit, OnDestroy {
  private readonly ipc = inject(IpcService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private disposeLogs: (() => void) | undefined;
  private disposeStep: (() => void) | undefined;
  protected readonly rows = signal<LogRow[]>([]);
  protected readonly filter = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly expanded = signal(new Set<string>());

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      this.filter.set(pm.get('q') ?? '');
      this.statusFilter.set(pm.get('status') ?? 'all');
    });
    void this.reload();
    this.disposeLogs = this.ipc.api.app.onLogsNew(() => void this.reload());
    this.disposeStep = this.ipc.api.logs.onStepProgress((step) => {
      const logId = String(step['logId'] ?? '');
      if (!logId) return;
      const line: LogStepRow = {
        step_kind: String(step['stepKind'] ?? ''),
        status: String(step['status'] ?? ''),
        message: (step['message'] as string) ?? null,
        error: (step['error'] as string) ?? null,
      };
      this.rows.update((list) =>
        list.map((r) => (r.id === logId ? { ...r, steps: [...(r.steps ?? []), line] } : r))
      );
    });
  }

  ngOnDestroy(): void {
    this.disposeLogs?.();
    this.disposeStep?.();
  }

  protected onFilterChange(v: string): void {
    this.filter.set(v);
    this.syncQueryParams();
  }

  protected onStatusChange(v: string): void {
    this.statusFilter.set(v);
    this.syncQueryParams();
  }

  private syncQueryParams(): void {
    const q = this.filter().trim();
    const st = this.statusFilter();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: q || undefined,
        status: st === 'all' ? undefined : st,
      },
      replaceUrl: true,
    });
  }

  protected filteredRows(): LogRow[] {
    const q = this.filter().toLowerCase();
    const st = this.statusFilter();
    return this.rows().filter((r) => {
      const textOk = q
        ? r.workflow_name.toLowerCase().includes(q) || (r.message ?? '').toLowerCase().includes(q) || (r.error ?? '').toLowerCase().includes(q)
        : true;
      const statusOk = st === 'all' || r.status === st;
      return textOk && statusOk;
    });
  }

  private async reload(): Promise<void> {
    const logs = (await this.ipc.api.logs.list({ limit: 100 })) as Array<Record<string, unknown>>;
    const wfMap = new Map((await this.ipc.api.workflows.list()).map((w) => [w.id, w.name]));
    const mapped: LogRow[] = logs.map((l) => ({
      id: String(l['id']),
      workflow_id: String(l['workflow_id']),
      started_at: String(l['started_at'] ?? ''),
      finished_at: (l['finished_at'] as string) ?? null,
      status: String(l['status'] ?? ''),
      message: (l['message'] as string) ?? null,
      error: (l['error'] as string) ?? null,
      workflow_name: wfMap.get(String(l['workflow_id'])) ?? String(l['workflow_id']),
    }));
    this.rows.set(mapped);
  }

  protected statusIcon(s: string): string {
    if (s === 'success') return '✓';
    if (s === 'failure') return '✕';
    if (s === 'skipped') return '⊘';
    return 'ℹ';
  }

  protected duration(row: LogRow): string {
    if (!row.started_at || !row.finished_at) return '—';
    const ms = new Date(row.finished_at).getTime() - new Date(row.started_at).getTime();
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  async toggle(id: string): Promise<void> {
    const set = new Set(this.expanded());
    if (set.has(id)) set.delete(id);
    else {
      set.add(id);
      const detail = await this.ipc.api.logs.get(id);
      const steps = (detail.steps ?? []) as LogStepRow[];
      this.rows.update((list) => list.map((r) => (r.id === id ? { ...r, steps } : r)));
    }
    this.expanded.set(set);
  }

  async exportLogs(format: 'csv' | 'json'): Promise<void> {
    try {
      const path = await this.ipc.api.logs.export(format);
      if (path) this.toast.success(`Exported to ${path}`);
      else this.toast.info('Export cancelled');
    } catch {
      this.toast.error('Could not export logs');
    }
  }

  async clear(): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Clear logs',
      message: 'Remove all execution logs and step details? This cannot be undone.',
      confirmLabel: 'Clear all',
    });
    if (!ok) return;
    await this.ipc.api.logs.clear();
    await this.reload();
  }
}
