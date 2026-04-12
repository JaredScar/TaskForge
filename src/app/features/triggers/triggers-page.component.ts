import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { isEntitlementRequiredError } from '../../core/utils/entitlement-error';

type TriggerItem = { kind: string; title: string; desc: string; icon: string; pro: boolean };

const BASIC: TriggerItem[] = [
  { kind: 'time_schedule', title: 'Time Schedule', desc: 'Run at specific times or intervals', icon: '🕐', pro: false },
  { kind: 'interval_trigger', title: 'Every N minutes', desc: 'Repeating timer without cron', icon: '⏱', pro: false },
  { kind: 'power_event', title: 'Power & session', desc: 'AC/battery, sleep, resume, lock', icon: '🔋', pro: false },
  { kind: 'app_launch', title: 'App Launch', desc: 'When a process starts (polled)', icon: '🖥', pro: false },
  { kind: 'system_startup', title: 'System Startup', desc: 'Run on Windows login', icon: '↻', pro: false },
];

const ADVANCED: TriggerItem[] = [
  { kind: 'network_change', title: 'Network Change', desc: 'Detect WiFi or network changes', icon: '📶', pro: true },
  { kind: 'file_change', title: 'File Change', desc: 'Monitor file or folder modifications', icon: '📁', pro: true },
  { kind: 'cpu_memory_usage', title: 'CPU/Memory Usage', desc: 'Trigger on resource thresholds', icon: '💾', pro: true },
  { kind: 'device_connected', title: 'Device Connected', desc: 'Headphones or USB (polled)', icon: '🎧', pro: true },
  { kind: 'idle_trigger', title: 'User idle', desc: 'After keyboard/mouse idle time', icon: '💤', pro: true },
  { kind: 'memory_trigger', title: 'Memory usage', desc: 'RAM percent above or below threshold', icon: '🧠', pro: true },
  { kind: 'device_trigger', title: 'USB change', desc: 'When USB device count changes', icon: '🔌', pro: true },
];

@Component({
  selector: 'app-triggers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-4xl">
      <h1 class="text-xl font-semibold">Triggers</h1>
      <p class="mt-1 text-sm text-tf-muted">Supported trigger types the automation engine can schedule or listen for</p>
      <h2 class="mt-8 text-sm font-medium text-tf-muted">Basic</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (t of basic; track t.kind) {
          <div
            class="flex flex-col rounded-xl border border-tf-border bg-tf-card p-4 transition-colors hover:border-tf-green/35"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="text-2xl">{{ t.icon }}</span>
              @if (t.pro) {
                <span class="shrink-0 rounded bg-tf-green/20 px-1.5 text-[10px] text-tf-green">Pro</span>
              }
            </div>
            <h3 class="mt-2 font-medium">{{ t.title }}</h3>
            <p class="mt-1 flex-1 text-xs text-tf-muted">{{ t.desc }}</p>
            <p class="mt-2 text-[11px] text-neutral-500">Used in {{ usageCount(t.kind) }} workflow(s)</p>
            <button
              type="button"
              [disabled]="busy() || isViewer() || (t.pro && !proEntitled())"
              (click)="startWithTrigger(t)"
              class="mt-3 w-full rounded-lg border border-tf-border py-2 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
            >
              New workflow with this trigger
            </button>
          </div>
        }
      </div>
      <h2 class="mt-8 text-sm font-medium text-tf-muted">Advanced (Pro)</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (t of advanced; track t.kind) {
          <div
            class="flex flex-col rounded-xl border border-tf-border bg-tf-card p-4 transition-colors hover:border-tf-green/35"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="text-2xl">{{ t.icon }}</span>
              @if (t.pro) {
                <span class="shrink-0 rounded bg-tf-green/20 px-1.5 text-[10px] text-tf-green">Pro</span>
              }
            </div>
            <h3 class="mt-2 font-medium">{{ t.title }}</h3>
            <p class="mt-1 flex-1 text-xs text-tf-muted">{{ t.desc }}</p>
            <p class="mt-2 text-[11px] text-neutral-500">Used in {{ usageCount(t.kind) }} workflow(s)</p>
            <button
              type="button"
              [disabled]="busy() || isViewer() || (t.pro && !proEntitled())"
              (click)="startWithTrigger(t)"
              class="mt-3 w-full rounded-lg border border-tf-border py-2 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
            >
              New workflow with this trigger
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class TriggersPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly basic = BASIC;
  protected readonly advanced = ADVANCED;
  protected readonly usage = signal<Record<string, number>>({});
  protected readonly busy = signal(false);
  protected readonly proEntitled = signal(false);
  protected readonly isViewer = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      this.proEntitled.set(unlocked);
      if (unlocked) {
        const team = (await this.ipc.api.team.list()) as Array<{ is_self: number; role: string }>;
        const self = team.find((m) => m.is_self === 1);
        this.isViewer.set(self?.role === 'Viewer');
      }
    } catch {
      this.proEntitled.set(false);
    }
    await this.reloadUsage();
  }

  protected usageCount(kind: string): number {
    return this.usage()[kind] ?? 0;
  }

  private async reloadUsage(): Promise<void> {
    try {
      const rows = await this.ipc.api.catalog.usageByKind('trigger');
      const map: Record<string, number> = {};
      for (const r of rows) map[r.kind] = r.count;
      this.usage.set(map);
    } catch {
      this.usage.set({});
    }
  }

  async startWithTrigger(t: TriggerItem): Promise<void> {
    if (this.isViewer()) {
      this.toast.warning('Viewers cannot create workflows from the catalog.');
      return;
    }
    this.busy.set(true);
    try {
      const id = await this.ipc.api.workflows.createFromStarter({
        mode: 'trigger',
        kind: t.kind,
        displayTitle: t.title,
      });
      this.toast.success('Workflow created — customize in the builder');
      await this.reloadUsage();
      void this.router.navigate(['/builder', id]);
    } catch (e) {
      if (isEntitlementRequiredError(e)) {
        this.toast.warning('Pro license required. Add your key in Settings.');
        void this.router.navigate(['/settings'], { queryParams: { unlock: '1' } });
        return;
      }
      this.toast.error('Could not create workflow');
    } finally {
      this.busy.set(false);
    }
  }
}
