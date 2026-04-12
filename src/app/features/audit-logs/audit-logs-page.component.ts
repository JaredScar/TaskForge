import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

interface AuditRow {
  id: string;
  user_id: string;
  action: string;
  resource: string;
  ip: string;
  status: string;
  created_at: string;
}

@Component({
  selector: 'app-audit-logs-page',
  imports: [FormsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">Audit Logs</h1>
          <p class="mt-1 text-sm text-tf-muted">Security and compliance event tracking</p>
        </div>
        <button type="button" (click)="exportCsv()" class="rounded-lg border border-tf-border px-4 py-2 text-sm hover:bg-neutral-800">
          Export CSV
        </button>
      </div>
      <div class="mt-4 flex flex-wrap gap-2">
        <input
          type="search"
          [(ngModel)]="filterAction"
          (ngModelChange)="applyFilters()"
          placeholder="Filter action…"
          class="h-9 min-w-[8rem] flex-1 rounded-lg border border-tf-border bg-tf-card px-3 text-sm outline-none focus:ring-1 focus:ring-tf-green"
        />
        <input
          type="search"
          [(ngModel)]="filterUser"
          (ngModelChange)="applyFilters()"
          placeholder="User…"
          class="h-9 min-w-[8rem] flex-1 rounded-lg border border-tf-border bg-tf-card px-3 text-sm outline-none focus:ring-1 focus:ring-tf-green"
        />
        <input
          type="search"
          [(ngModel)]="filterStatus"
          (ngModelChange)="applyFilters()"
          placeholder="Status…"
          class="h-9 min-w-[6rem] w-28 rounded-lg border border-tf-border bg-tf-card px-3 text-sm outline-none focus:ring-1 focus:ring-tf-green"
        />
        <label class="flex min-w-[8.5rem] flex-1 items-center gap-2 text-xs text-tf-muted">
          From
          <input
            type="date"
            [(ngModel)]="filterFrom"
            (ngModelChange)="applyFilters()"
            class="h-9 min-w-0 flex-1 rounded-lg border border-tf-border bg-tf-card px-2 text-sm text-neutral-200"
          />
        </label>
        <label class="flex min-w-[8.5rem] flex-1 items-center gap-2 text-xs text-tf-muted">
          To
          <input
            type="date"
            [(ngModel)]="filterTo"
            (ngModelChange)="applyFilters()"
            class="h-9 min-w-0 flex-1 rounded-lg border border-tf-border bg-tf-card px-2 text-sm text-neutral-200"
          />
        </label>
        <input
          type="search"
          [(ngModel)]="filterQ"
          (ngModelChange)="applyFilters()"
          placeholder="Search resource / action / user…"
          class="h-9 min-w-[10rem] flex-[2] rounded-lg border border-tf-border bg-tf-card px-3 text-sm outline-none focus:ring-1 focus:ring-tf-green"
        />
      </div>
      @if (rows().length === 0) {
        <app-empty-state
          class="mt-6 block"
          icon="📋"
          title="No audit entries"
          description="Events from the app and API appear here. Adjust filters or clear date range to see more rows."
        />
      }
      <div class="mt-4 overflow-hidden rounded-xl border border-tf-border" [class.hidden]="rows().length === 0">
        <table class="w-full text-left text-sm">
          <thead class="border-b border-tf-border bg-tf-card text-xs text-tf-muted">
            <tr>
              <th class="p-3">Time</th>
              <th class="p-3">User</th>
              <th class="p-3">Action</th>
              <th class="p-3">Resource</th>
              <th class="p-3">IP</th>
              <th class="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr class="border-b border-tf-border/60">
                <td class="p-3 font-mono text-xs">{{ timeOnly(r.created_at) }}</td>
                <td class="p-3 text-xs">{{ r.user_id }}</td>
                <td class="p-3">
                  <span class="rounded bg-neutral-800 px-2 py-0.5 text-[10px]">{{ r.action }}</span>
                </td>
                <td class="p-3 text-xs">{{ r.resource }}</td>
                <td class="p-3 font-mono text-xs text-tf-muted">{{ r.ip }}</td>
                <td class="p-3">
                  <span class="rounded-full bg-tf-green/20 px-2 py-0.5 text-[10px] text-tf-green">{{ r.status }}</span>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AuditLogsPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly toast = inject(ToastService);
  protected readonly rows = signal<AuditRow[]>([]);
  protected filterAction = '';
  protected filterUser = '';
  protected filterStatus = '';
  protected filterFrom = '';
  protected filterTo = '';
  protected filterQ = '';

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected async applyFilters(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    const list = await this.ipc.api.audit.list({
      action: this.filterAction.trim() || undefined,
      userId: this.filterUser.trim() || undefined,
      status: this.filterStatus.trim() || undefined,
      from: this.filterFrom.trim() || undefined,
      to: this.filterTo.trim() || undefined,
      q: this.filterQ.trim() || undefined,
    });
    this.rows.set(list);
  }

  protected timeOnly(iso: string): string {
    return iso.length >= 19 ? iso.slice(11, 19) : iso;
  }

  async exportCsv(): Promise<void> {
    try {
      const path = await this.ipc.api.audit.export();
      if (path) this.toast.success(`Exported to ${path}`);
      else this.toast.info('Export cancelled');
    } catch {
      this.toast.error('Could not export audit log');
    }
  }
}
