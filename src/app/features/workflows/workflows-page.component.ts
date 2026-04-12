import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass, TitleCasePipe } from '@angular/common';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadingService } from '../../core/services/loading.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';
import { toastAfterManualWorkflowRun } from '../../core/utils/workflow-run-feedback';
import type { WorkflowDto } from '../../../types/taskforge-window';

interface LogStepRow {
  step_kind: string;
  status: string;
  message: string | null;
  error: string | null;
}

interface LastRunDetail {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  message: string | null;
  steps: LogStepRow[];
}

@Component({
  selector: 'app-workflows-page',
  imports: [FormsModule, RouterLink, NgClass, TitleCasePipe, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 pb-16">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold">Workflows</h1>
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="search"
            data-tf-focus-search
            [ngModel]="searchQuery()"
            (ngModelChange)="searchQuery.set($event)"
            placeholder="Search workflows..."
            class="h-9 w-56 rounded-lg border border-tf-border bg-tf-card px-3 text-sm outline-none ring-tf-green focus:ring-1"
          />
          @if (!isViewer() && list().length > 0) {
            <label class="flex cursor-pointer items-center gap-2 text-xs text-tf-muted">
              <input
                type="checkbox"
                [checked]="allFilteredSelected()"
                (change)="toggleSelectAll($event)"
              />
              Select visible
            </label>
          }
          @if (!isViewer()) {
            <button
              type="button"
              (click)="newWorkflow()"
              class="h-9 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-neutral-200"
            >
              + New Workflow
            </button>
          }
        </div>
      </div>
      @if (list().length === 0) {
        <div>
          <app-empty-state
            icon="⚡"
            title="No workflows yet"
            [description]="
              isViewer()
                ? 'No workflows yet. View-only accounts cannot create workflows here.'
                : 'Create your first automation, use onboarding, or install a template from the Marketplace (Pro).'
            "
          />
          @if (!isViewer()) {
            <div class="mt-4 flex justify-center">
              <button
                type="button"
                (click)="newWorkflow()"
                class="rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black hover:opacity-90"
              >
                Create workflow
              </button>
            </div>
          }
        </div>
      } @else {
        <div class="flex flex-wrap gap-2">
          @for (t of tagFilters(); track t) {
            <button
              type="button"
              (click)="activeTag.set(t)"
              class="rounded-full border px-3 py-1 text-xs transition"
              [class.border-tf-green]="activeTag() === t"
              [class.bg-tf-green]="activeTag() === t"
              [class.text-black]="activeTag() === t"
              [class.border-tf-border]="activeTag() !== t"
              [class.text-neutral-400]="activeTag() !== t"
            >
              {{ t }}
            </button>
          }
        </div>
        @if (filtered().length === 0) {
          <p class="rounded-lg border border-tf-border bg-tf-card px-4 py-8 text-center text-sm text-tf-muted">
            No workflows match your search or tag filter.
          </p>
        } @else {
          <div class="grid gap-3 md:grid-cols-2">
            @for (w of filtered(); track w.id) {
              <article class="rounded-xl border border-tf-border bg-tf-card p-4">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-start gap-3">
                    @if (!isViewer()) {
                      <input
                        type="checkbox"
                        class="mt-2 h-4 w-4 rounded border-tf-border"
                        [checked]="selectedIds().has(w.id)"
                        (change)="toggleSelect(w.id, $event)"
                        (click)="$event.stopPropagation()"
                      />
                    }
                    <button
                      type="button"
                      (click)="toggle(w)"
                      class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-tf-border"
                      [class.bg-tf-green]="w.enabled"
                      [class.text-black]="w.enabled"
                      [class.text-neutral-500]="!w.enabled"
                      [disabled]="isViewer()"
                      title="Enable / disable"
                    >
                      @if (w.enabled) {
                        <span class="text-lg">▶</span>
                      } @else {
                        <span class="text-lg">❚❚</span>
                      }
                    </button>
                    <div>
                      <h2 class="font-medium">{{ w.name }}</h2>
                      <p class="mt-1 text-xs text-tf-muted">{{ triggerLabel(w) }}</p>
                      <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-tf-muted">
                        <span>{{ w.last_run_summary ?? 'Never' }}</span>
                        <span>|</span>
                        <span>{{ w.run_count }} runs</span>
                      </div>
                    </div>
                  </div>
                  <span
                    class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    [ngClass]="priorityClass(w.priority)"
                  >
                    {{ w.priority | titlecase }}
                  </span>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  @if (!isViewer()) {
                    <a [routerLink]="['/builder', w.id]" class="text-xs text-tf-green hover:underline">Edit in Builder</a>
                  } @else {
                    <span class="text-xs text-tf-muted">View only</span>
                  }
                  <button type="button" (click)="runNow(w.id)" class="text-xs text-neutral-400 hover:text-white">
                    @if (runningId() === w.id) {
                      <span class="inline-block h-3 w-3 animate-spin rounded-full border border-neutral-500 border-t-transparent"></span>
                    } @else {
                      Test run
                    }
                  </button>
                  <button type="button" (click)="toggleLastRun(w.id)" class="text-xs text-neutral-400 hover:text-white">
                    {{ lastRunPanelId() === w.id ? 'Hide last run' : 'View last run' }}
                  </button>
                  @if (!isViewer()) {
                    <button type="button" (click)="duplicateWorkflow(w)" class="text-xs text-neutral-400 hover:text-white">Duplicate</button>
                    <button type="button" (click)="remove(w.id)" class="text-xs text-red-400 hover:underline">Delete</button>
                  }
                </div>
                @if (lastRunPanelId() === w.id) {
                  <div class="mt-3 rounded-lg border border-tf-border bg-tf-bg p-3 text-xs text-neutral-300">
                    @if (lastRunDetail(); as lr) {
                      <p class="font-mono text-[10px] text-tf-muted">{{ lr.started_at }} · {{ lr.status }}</p>
                      <p class="mt-1">{{ lr.message || '—' }}</p>
                      @if (lr.steps.length) {
                        <ul class="mt-2 space-y-1 font-mono text-[10px] text-neutral-500">
                          @for (s of lr.steps; track $index) {
                            <li>{{ s.step_kind }} — {{ s.status }} — {{ s.message }}</li>
                          }
                        </ul>
                      }
                    } @else {
                      <p class="text-tf-muted">Loading…</p>
                    }
                  </div>
                }
              </article>
            }
          </div>
        }
      }
    </div>
    @if (!isViewer() && selectedIds().size > 0) {
      <div
        class="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border border-tf-border bg-tf-card px-4 py-3 shadow-xl"
      >
        <span class="text-sm text-neutral-300">{{ selectedIds().size }} selected</span>
        <button type="button" class="rounded-lg bg-tf-green px-3 py-1.5 text-xs font-medium text-black" (click)="bulkSetEnabled(true)">
          Enable
        </button>
        <button type="button" class="rounded-lg border border-tf-border px-3 py-1.5 text-xs text-neutral-200" (click)="bulkSetEnabled(false)">
          Disable
        </button>
        <button type="button" class="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300" (click)="bulkDelete()">
          Delete
        </button>
        <button type="button" class="text-xs text-tf-muted hover:text-white" (click)="clearSelection()">Clear</button>
      </div>
    }
  `,
})
export class WorkflowsPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly loading = inject(LoadingService);

  protected readonly list = signal<WorkflowDto[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly activeTag = signal('All');
  protected readonly selectedIds = signal<Set<string>>(new Set());
  protected readonly runningId = signal<string | null>(null);
  protected readonly lastRunPanelId = signal<string | null>(null);
  protected readonly lastRunDetail = signal<LastRunDetail | null>(null);
  protected readonly isViewer = signal(false);

  /** Tag chips derived from workflows only (no hardcoded demo tags). */
  protected readonly tagFilters = computed(() => {
    const set = new Set<string>();
    for (const w of this.list()) {
      try {
        const tags = JSON.parse(w.tags) as unknown;
        if (Array.isArray(tags)) {
          for (const t of tags) {
            if (typeof t === 'string' && t.trim()) set.add(t);
          }
        }
      } catch {
        /* ignore invalid JSON */
      }
    }
    return ['All', ...[...set].sort((a, b) => a.localeCompare(b))];
  });

  protected readonly filtered = computed(() => {
    let rows = this.list();
    const q = this.searchQuery().toLowerCase();
    if (q) rows = rows.filter((w) => w.name.toLowerCase().includes(q) || w.description.toLowerCase().includes(q));
    const filters = this.tagFilters();
    let tag = this.activeTag();
    if (!filters.includes(tag)) tag = 'All';
    if (tag !== 'All') {
      rows = rows.filter((w) => {
        try {
          const tags = JSON.parse(w.tags) as string[];
          return tags?.includes(tag);
        } catch {
          return false;
        }
      });
    }
    return rows;
  });

  async ngOnInit(): Promise<void> {
    await this.reload();
    await this.loadViewerFlag();
  }

  private async loadViewerFlag(): Promise<void> {
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      if (!unlocked) return;
      const team = (await this.ipc.api.team.list()) as Array<{ is_self: number; role: string }>;
      const self = team.find((m) => m.is_self === 1);
      this.isViewer.set(self?.role === 'Viewer');
    } catch {
      /* ignore */
    }
  }

  async reload(): Promise<void> {
    await this.loading.run(async () => {
      this.list.set(await this.ipc.api.workflows.list());
      const valid = new Set(this.list().map((w) => w.id));
      const sel = new Set([...this.selectedIds()].filter((id) => valid.has(id)));
      this.selectedIds.set(sel);
    });
  }

  protected toggleSelect(id: string, ev: Event): void {
    ev.stopPropagation();
    const s = new Set(this.selectedIds());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.selectedIds.set(s);
  }

  protected allFilteredSelected(): boolean {
    const f = this.filtered();
    if (f.length === 0) return false;
    const s = this.selectedIds();
    return f.every((w) => s.has(w.id));
  }

  protected toggleSelectAll(ev: Event): void {
    const c = ev.target as HTMLInputElement;
    if (c.checked) {
      this.selectedIds.set(new Set(this.filtered().map((w) => w.id)));
    } else {
      this.selectedIds.set(new Set());
    }
  }

  protected clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  async bulkDelete(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) return;
    const skip = (await this.ipc.api.settings.get('confirm_delete_workflow')) === '0';
    if (!skip) {
      const ok = await this.confirmDialog.confirm({
        title: 'Delete workflows',
        message: `Delete ${ids.length} workflow(s)? This cannot be undone.`,
        confirmLabel: 'Delete all',
      });
      if (!ok) return;
    }
    for (const id of ids) {
      await this.ipc.api.workflows.delete(id);
    }
    this.clearSelection();
    await this.reload();
    this.toast.info(`${ids.length} workflow(s) deleted`);
  }

  async bulkSetEnabled(enabled: boolean): Promise<void> {
    const ids = [...this.selectedIds()];
    for (const id of ids) {
      await this.ipc.api.workflows.setEnabled({ id, enabled });
    }
    await this.reload();
    this.toast.success(enabled ? 'Workflows enabled' : 'Workflows disabled');
  }

  priorityClass(p: string): Record<string, boolean> {
    const x = p.toLowerCase();
    return {
      'bg-blue-500/20 text-blue-300': x === 'normal',
      'bg-orange-500/20 text-orange-300': x === 'high',
      'bg-violet-500/20 text-violet-300': x === 'low',
    };
  }

  triggerLabel(w: WorkflowDto): string {
    const d = w.description?.trim();
    return d || 'No description yet — edit in Builder';
  }

  async toggle(w: WorkflowDto): Promise<void> {
    await this.ipc.api.workflows.toggle(w.id);
    await this.reload();
  }

  async runNow(id: string): Promise<void> {
    this.runningId.set(id);
    try {
      const logId = await this.ipc.api.engine.runWorkflow(id);
      await this.reload();
      await toastAfterManualWorkflowRun(this.ipc.api, logId, this.toast);
    } finally {
      this.runningId.set(null);
    }
  }

  protected async toggleLastRun(workflowId: string): Promise<void> {
    if (this.lastRunPanelId() === workflowId) {
      this.lastRunPanelId.set(null);
      this.lastRunDetail.set(null);
      return;
    }
    this.lastRunPanelId.set(workflowId);
    this.lastRunDetail.set(null);
    const logs = await this.ipc.api.logs.list({ limit: 50, workflowId });
    const first = logs[0];
    if (!first) {
      this.lastRunDetail.set(null);
      return;
    }
    const logId = first.id;
    const detail = await this.ipc.api.logs.get(logId);
    const log = detail.log;
    const steps = (detail.steps ?? []) as LogStepRow[];
    if (!log) {
      this.lastRunDetail.set(null);
      return;
    }
    this.lastRunDetail.set({
      id: logId,
      started_at: log.started_at,
      finished_at: log.finished_at,
      status: log.status,
      message: log.message,
      steps,
    });
  }

  async remove(id: string): Promise<void> {
    const skip = (await this.ipc.api.settings.get('confirm_delete_workflow')) === '0';
    if (!skip) {
      const ok = await this.confirmDialog.confirm({
        title: 'Delete workflow',
        message: 'Delete this workflow? This cannot be undone.',
        confirmLabel: 'Delete',
      });
      if (!ok) return;
    }
    await this.ipc.api.workflows.delete(id);
    await this.reload();
    this.toast.info('Workflow deleted');
  }

  async newWorkflow(): Promise<void> {
    if (this.isViewer()) {
      this.toast.warning('Viewers cannot create workflows.');
      return;
    }
    const id = await this.ipc.api.workflows.create({ name: 'Untitled workflow', description: '' });
    await this.reload();
    void this.router.navigate(['/builder', id]);
  }

  async duplicateWorkflow(w: WorkflowDto): Promise<void> {
    try {
      const id = await this.ipc.api.workflows.duplicate(w.id);
      if (!id) {
        this.toast.error('Could not duplicate workflow');
        return;
      }
      await this.reload();
      this.toast.success('Workflow duplicated');
      void this.router.navigate(['/builder', id]);
    } catch {
      this.toast.error('Could not duplicate workflow');
    }
  }
}
