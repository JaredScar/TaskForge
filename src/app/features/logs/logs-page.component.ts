import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
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
  trigger_kind: string | null;
  workflow_name: string;
  steps?: LogStepRow[];
}

/** Local calendar day `YYYY-MM-DD` for `started_at` (user's timezone). */
function localDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** PLAN §6.2 — live step stream from `logs:stepProgress`. */
interface LiveStepLine {
  stepIndex: number;
  stepType: string;
  stepKind: string;
  status: string;
  message: string | null;
  error: string | null;
}

interface LiveSession {
  logId: string;
  workflowId: string;
  workflowName: string;
  steps: LiveStepLine[];
  phase: 'running' | 'finished';
  finalStatus?: string;
}

function upsertLiveStep(steps: LiveStepLine[], line: LiveStepLine): LiveStepLine[] {
  const map = new Map(steps.map((s) => [s.stepIndex, s]));
  map.set(line.stepIndex, line);
  return Array.from(map.values()).sort((a, b) => a.stepIndex - b.stepIndex);
}

@Component({
  selector: 'app-logs-page',
  imports: [FormsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
            placeholder="Search workflow, message, error, trigger…"
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
          <label class="flex h-9 items-center gap-1.5 rounded-lg border border-tf-border bg-tf-card px-2 text-xs text-tf-muted">
            <span class="shrink-0">From</span>
            <input
              type="date"
              [ngModel]="dateFrom()"
              (ngModelChange)="onDateFromChange($event)"
              class="min-w-0 bg-transparent text-sm text-neutral-200 outline-none"
            />
          </label>
          <label class="flex h-9 items-center gap-1.5 rounded-lg border border-tf-border bg-tf-card px-2 text-xs text-tf-muted">
            <span class="shrink-0">To</span>
            <input
              type="date"
              [ngModel]="dateTo()"
              (ngModelChange)="onDateToChange($event)"
              class="min-w-0 bg-transparent text-sm text-neutral-200 outline-none"
            />
          </label>
          <select
            [ngModel]="triggerFilter()"
            (ngModelChange)="onTriggerFilterChange($event)"
            class="h-9 max-w-[10rem] rounded-lg border border-tf-border bg-tf-card px-2 text-sm outline-none focus:ring-1 focus:ring-tf-green"
          >
            <option value="all">All triggers</option>
            @for (tk of triggerKindOptions(); track tk) {
              <option [value]="tk">{{ formatTriggerLabel(tk) }}</option>
            }
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
          @if (!isViewer()) {
            <button type="button" (click)="clear()" class="h-9 rounded-lg border border-tf-border px-3 text-sm hover:bg-neutral-800">
              Clear all
            </button>
          }
        </div>
      </div>
      @if (liveSessions().length > 0) {
        <div
          class="mt-4 rounded-xl border border-tf-green/40 bg-tf-card/80 p-4 shadow-[0_0_24px_-8px_rgba(34,197,94,0.25)]"
          role="region"
          aria-label="Live workflow runs"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-neutral-100">Live run</h2>
              @if (hasRunningLiveSession()) {
                <span class="relative flex h-2 w-2">
                  <span
                    class="absolute inline-flex h-full w-full animate-ping rounded-full bg-tf-green opacity-60"
                  ></span>
                  <span class="relative inline-flex h-2 w-2 rounded-full bg-tf-green"></span>
                </span>
              }
            </div>
            @if (hasFinishedLiveSession()) {
              <button
                type="button"
                class="text-xs text-tf-muted hover:text-white"
                (click)="dismissFinishedLiveSessions()"
              >
                Clear finished
              </button>
            }
          </div>
          <div class="mt-3 space-y-4">
            @for (s of liveSessions(); track s.logId) {
              <div class="rounded-lg border border-tf-border/80 bg-tf-bg/40 p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p class="text-sm font-medium text-neutral-200">{{ s.workflowName }}</p>
                    <p class="font-mono text-[10px] text-tf-muted">{{ s.logId.slice(0, 8) }}…</p>
                  </div>
                  <div class="flex items-center gap-2">
                    @if (s.phase === 'finished' && s.finalStatus) {
                      @switch (s.finalStatus) {
                        @case ('success') {
                          <span
                            class="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-emerald-200"
                          >
                            {{ s.finalStatus }}
                          </span>
                        }
                        @case ('failure') {
                          <span
                            class="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-red-200"
                          >
                            {{ s.finalStatus }}
                          </span>
                        }
                        @default {
                          <span
                            class="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase text-amber-100"
                          >
                            {{ s.finalStatus }}
                          </span>
                        }
                      }
                    }
                    @if (s.phase === 'running') {
                      <span class="text-[10px] font-medium uppercase text-tf-green">Running</span>
                    }
                    <button
                      type="button"
                      class="text-xs text-tf-muted hover:text-white"
                      (click)="dismissLiveSession(s.logId)"
                      aria-label="Dismiss this live run panel"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                @if (s.phase === 'running' && s.steps.length === 0) {
                  <p class="mt-2 text-xs text-tf-muted">Waiting for steps…</p>
                }
                @if (s.steps.length > 0) {
                  <ul class="mt-2 space-y-1.5 border-t border-tf-border/50 pt-2 font-mono text-[11px] text-neutral-400">
                    @for (st of s.steps; track st.stepIndex) {
                      <li class="flex flex-wrap gap-x-2">
                        <span class="text-tf-muted">{{ st.stepType }}</span>
                        <span class="text-tf-green">{{ st.stepKind }}</span>
                        <span>{{ st.status }}</span>
                        @if (st.message) {
                          <span class="text-neutral-300">— {{ st.message }}</span>
                        }
                        @if (st.error) {
                          <span class="text-red-400">— {{ st.error }}</span>
                        }
                      </li>
                    }
                  </ul>
                }
              </div>
            }
          </div>
        </div>
      }
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
              <th class="p-3">Trigger</th>
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
                <td class="max-w-[8rem] truncate p-3 font-mono text-[10px] text-tf-muted" [title]="row.trigger_kind ?? ''">
                  {{ formatTriggerLabel(row.trigger_kind) }}
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
                  <td colspan="7" class="p-4 font-mono text-xs text-neutral-400">
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
export class LogsPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private disposeLogs: (() => void) | undefined;
  private disposeStep: (() => void) | undefined;
  protected readonly rows = signal<LogRow[]>([]);
  protected readonly liveSessions = signal<LiveSession[]>([]);
  protected readonly filter = signal('');
  protected readonly statusFilter = signal('all');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  protected readonly triggerFilter = signal('all');
  protected readonly expanded = signal(new Set<string>());
  protected readonly isViewer = signal(false);

  ngOnInit(): void {
    void this.loadViewerFlag();
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((pm) => {
      this.filter.set(pm.get('q') ?? '');
      this.statusFilter.set(pm.get('status') ?? 'all');
      this.dateFrom.set(pm.get('from') ?? '');
      this.dateTo.set(pm.get('to') ?? '');
      this.triggerFilter.set(pm.get('trigger') ?? 'all');
    });
    void this.reload();
    this.disposeLogs = this.ipc.api.app.onLogsNew(() => void this.reload());
    this.destroyRef.onDestroy(() => {
      this.disposeLogs?.();
      this.disposeStep?.();
    });
    this.disposeStep = this.ipc.api.logs.onStepProgress((step) => {
      const logId = String(step['logId'] ?? '');
      if (!logId) return;
      const workflowId = String(step['workflowId'] ?? '');
      const stepIndex = Number(step['stepIndex'] ?? 0);
      const liveLine: LiveStepLine = {
        stepIndex,
        stepType: String(step['stepType'] ?? ''),
        stepKind: String(step['stepKind'] ?? ''),
        status: String(step['status'] ?? ''),
        message: (step['message'] as string) ?? null,
        error: (step['error'] as string) ?? null,
      };
      const row = this.rows().find((r) => r.id === logId);
      const wfName = row?.workflow_name ?? 'Workflow';
      this.liveSessions.update((sessions) => {
        const i = sessions.findIndex((s) => s.logId === logId);
        if (i < 0) {
          return [...sessions, { logId, workflowId, workflowName: wfName, steps: [liveLine], phase: 'running' }];
        }
        return sessions.map((sess, j) =>
          j === i
            ? {
                ...sess,
                workflowName: wfName || sess.workflowName,
                steps: upsertLiveStep(sess.steps, liveLine),
                phase: 'running',
              }
            : sess
        );
      });
      const line: LogStepRow = {
        step_kind: liveLine.stepKind,
        status: liveLine.status,
        message: liveLine.message,
        error: liveLine.error,
      };
      this.rows.update((list) =>
        list.map((r) => (r.id === logId ? { ...r, steps: [...(r.steps ?? []), line] } : r))
      );
    });
  }

  private async loadViewerFlag(): Promise<void> {
    if (!this.ipc.isElectron) return;
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      if (!unlocked) return;
      const team = await this.ipc.api.team.list();
      const self = team.find((m) => m.is_self === 1);
      this.isViewer.set(self?.role === 'Viewer');
    } catch {
      /* ignore */
    }
  }

  protected hasRunningLiveSession(): boolean {
    return this.liveSessions().some((s) => s.phase === 'running');
  }

  protected hasFinishedLiveSession(): boolean {
    return this.liveSessions().some((s) => s.phase === 'finished');
  }

  protected dismissLiveSession(logId: string): void {
    this.liveSessions.update((sessions) => sessions.filter((s) => s.logId !== logId));
  }

  protected dismissFinishedLiveSessions(): void {
    this.liveSessions.update((sessions) => sessions.filter((s) => s.phase !== 'finished'));
  }

  protected onFilterChange(v: string): void {
    this.filter.set(v);
    this.syncQueryParams();
  }

  protected onStatusChange(v: string): void {
    this.statusFilter.set(v);
    this.syncQueryParams();
  }

  protected onDateFromChange(v: string): void {
    this.dateFrom.set(v ?? '');
    this.syncQueryParams();
  }

  protected onDateToChange(v: string): void {
    this.dateTo.set(v ?? '');
    this.syncQueryParams();
  }

  protected onTriggerFilterChange(v: string): void {
    this.triggerFilter.set(v || 'all');
    this.syncQueryParams();
  }

  /** Distinct non-empty trigger_kind values in the loaded page (for the dropdown). */
  protected triggerKindOptions(): string[] {
    const set = new Set<string>();
    for (const r of this.rows()) {
      const t = (r.trigger_kind ?? '').trim();
      if (t) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  protected formatTriggerLabel(kind: string | null | undefined): string {
    if (kind == null || kind === '') return '—';
    return kind.replace(/_/g, ' ');
  }

  private syncQueryParams(): void {
    const q = this.filter().trim();
    const st = this.statusFilter();
    const from = this.dateFrom().trim();
    const to = this.dateTo().trim();
    const tr = this.triggerFilter();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: q || undefined,
        status: st === 'all' ? undefined : st,
        from: from || undefined,
        to: to || undefined,
        trigger: tr === 'all' ? undefined : tr,
      },
      replaceUrl: true,
    });
  }

  protected filteredRows(): LogRow[] {
    const q = this.filter().toLowerCase();
    const st = this.statusFilter();
    let fromD = this.dateFrom().trim();
    let toD = this.dateTo().trim();
    if (fromD && toD && fromD > toD) {
      const t = fromD;
      fromD = toD;
      toD = t;
    }
    const trig = this.triggerFilter();
    return this.rows().filter((r) => {
      const tkSearch = (r.trigger_kind ?? '').toLowerCase();
      const textOk = q
        ? r.workflow_name.toLowerCase().includes(q) ||
          (r.message ?? '').toLowerCase().includes(q) ||
          (r.error ?? '').toLowerCase().includes(q) ||
          tkSearch.includes(q)
        : true;
      const statusOk = st === 'all' || r.status === st;
      const day = localDayKey(r.started_at);
      const fromOk = !fromD || (day !== '' && day >= fromD);
      const toOk = !toD || (day !== '' && day <= toD);
      const trigOk = trig === 'all' || (r.trigger_kind ?? '') === trig;
      return textOk && statusOk && fromOk && toOk && trigOk;
    });
  }

  private async reload(): Promise<void> {
    const logs = await this.ipc.api.logs.list({ limit: 500 });
    const wfMap = new Map((await this.ipc.api.workflows.list()).map((w) => [w.id, w.name]));
    const mapped: LogRow[] = logs.map((l) => ({
      id: l.id,
      workflow_id: l.workflow_id,
      started_at: l.started_at,
      finished_at: l.finished_at,
      status: l.status,
      message: l.message,
      error: l.error,
      trigger_kind: l.trigger_kind,
      workflow_name: wfMap.get(l.workflow_id) ?? l.workflow_id,
    }));
    this.rows.set(mapped);
    this.hydrateLiveSessionsAfterReload();
  }

  /** Sync live panel with DB rows (running vs finished) and pick up runs we have not seen steps for yet. */
  private hydrateLiveSessionsAfterReload(): void {
    const list = this.rows();
    this.liveSessions.update((sessions) => {
      const mapped: LiveSession[] = [];
      for (const s of sessions) {
        const row = list.find((r) => r.id === s.logId);
        if (!row) continue;
        const phase: 'running' | 'finished' = row.status === 'running' ? 'running' : 'finished';
        const upd: LiveSession = {
          ...s,
          workflowName: row.workflow_name,
          phase,
        };
        if (phase === 'finished') {
          upd.finalStatus = row.status;
        } else {
          delete upd.finalStatus;
        }
        mapped.push(upd);
      }

      const next: LiveSession[] = [...mapped];
      for (const row of list) {
        if (row.status !== 'running') continue;
        if (next.some((s) => s.logId === row.id)) continue;
        next.push({
          logId: row.id,
          workflowId: row.workflow_id,
          workflowName: row.workflow_name,
          steps: [],
          phase: 'running',
        });
      }

      const maxFinished = 5;
      const running = next.filter((s) => s.phase === 'running');
      const finished = next.filter((s) => s.phase === 'finished');
      const tail = finished.slice(-maxFinished);
      return [...running, ...tail];
    });
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
    if (this.isViewer()) {
      this.toast.warning('Viewers cannot clear execution logs.');
      return;
    }
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
