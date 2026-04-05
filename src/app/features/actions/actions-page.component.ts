import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { isEntitlementRequiredError } from '../../core/utils/entitlement-error';
import type { WorkflowDto } from '../../../types/taskforge-window';

type ActionItem = { kind: string; title: string; desc: string; icon: string; pro: boolean };

const BASIC: ActionItem[] = [
  { kind: 'open_application', title: 'Open Application', desc: 'Launch any program', icon: '🖥', pro: false },
  { kind: 'show_notification', title: 'Show Notification', desc: 'Display Windows notification', icon: '🔔', pro: false },
  { kind: 'open_file_folder', title: 'Open File/Folder', desc: 'Open in default program', icon: '📂', pro: false },
  { kind: 'dark_mode_toggle', title: 'Dark Mode Toggle', desc: 'Switch system theme', icon: '🌙', pro: false },
  { kind: 'audio_control', title: 'Audio Control', desc: 'Volume and mute', icon: '🔊', pro: false },
  { kind: 'kill_process', title: 'Kill Process', desc: 'End a process by name or PID', icon: '⛔', pro: false },
  { kind: 'file_operation', title: 'File Operation', desc: 'Copy, move, delete, or mkdir', icon: '📋', pro: false },
  { kind: 'open_url', title: 'Open URL', desc: 'Open a link in the default browser', icon: '🔗', pro: false },
  { kind: 'clipboard_write', title: 'Set clipboard', desc: 'Put text on the system clipboard', icon: '📌', pro: false },
  { kind: 'write_text_file', title: 'Write text file', desc: 'Write or append a UTF-8 text file', icon: '📝', pro: false },
  { kind: 'lock_workstation', title: 'Lock screen', desc: 'Lock Windows session', icon: '🔒', pro: false },
];

const ADVANCED: ActionItem[] = [
  { kind: 'run_script', title: 'Run Script', desc: 'PowerShell or batch file', icon: '⌨', pro: true },
  { kind: 'http_request', title: 'HTTP Request', desc: 'Call APIs and webhooks', icon: '🌐', pro: true },
  { kind: 'zip_archive', title: 'Create ZIP', desc: 'Archive files or folders', icon: '🗜', pro: true },
  { kind: 'download_file', title: 'Download file', desc: 'Fetch a URL to disk (streaming)', icon: '⬇', pro: true },
  { kind: 'wake_on_lan', title: 'Wake-on-LAN', desc: 'Magic packet to wake a device', icon: '⚡', pro: true },
  { kind: 'tcp_port_check', title: 'TCP port check', desc: 'Health-check a host and port', icon: '🔌', pro: true },
  { kind: 'screenshot_save', title: 'Screenshot', desc: 'Capture screen to PNG', icon: '📸', pro: true },
];

@Component({
  selector: 'app-actions-page',
  imports: [FormsModule],
  template: `
    <div class="max-w-4xl">
      <h1 class="text-xl font-semibold">Actions</h1>
      <p class="mt-1 text-sm text-tf-muted">Supported action types the engine can run from your workflows</p>
      <h2 class="mt-8 text-sm font-medium text-tf-muted">Basic</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        @for (a of basic; track a.kind) {
          <div
            class="flex flex-col rounded-xl border border-tf-border bg-tf-card p-4 transition-colors hover:border-tf-green/35"
          >
            <div class="text-2xl">{{ a.icon }}</div>
            <h3 class="mt-2 font-medium">{{ a.title }}</h3>
            <p class="mt-1 flex-1 text-xs text-tf-muted">{{ a.desc }}</p>
            <p class="mt-2 text-[11px] text-neutral-500">Used in {{ usageCount(a.kind) }} workflow(s)</p>
            <div class="mt-3 flex flex-col gap-2">
              <button
                type="button"
                [disabled]="busy() || (a.pro && !proEntitled())"
                (click)="newWorkflowWithAction(a)"
                class="w-full rounded-lg border border-tf-border py-2 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
              >
                New workflow with this action
              </button>
              <button
                type="button"
                [disabled]="busy() || (a.pro && !proEntitled())"
                (click)="openAppendModal(a)"
                class="w-full rounded-lg py-2 text-sm text-tf-green hover:underline disabled:opacity-50"
              >
                Add to existing workflow…
              </button>
            </div>
          </div>
        }
      </div>
      <h2 class="mt-8 text-sm font-medium text-tf-muted">Advanced (Pro)</h2>
      <div class="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        @for (a of advanced; track a.kind) {
          <div
            class="flex flex-col rounded-xl border border-tf-border bg-tf-card p-4 transition-colors hover:border-tf-green/35"
          >
            <div class="flex items-start justify-between gap-2">
              <span class="text-2xl">{{ a.icon }}</span>
              <span class="shrink-0 rounded bg-tf-green/20 px-1.5 text-[10px] text-tf-green">Pro</span>
            </div>
            <h3 class="mt-2 font-medium">{{ a.title }}</h3>
            <p class="mt-1 flex-1 text-xs text-tf-muted">{{ a.desc }}</p>
            <p class="mt-2 text-[11px] text-neutral-500">Used in {{ usageCount(a.kind) }} workflow(s)</p>
            <div class="mt-3 flex flex-col gap-2">
              <button
                type="button"
                [disabled]="busy() || (a.pro && !proEntitled())"
                (click)="newWorkflowWithAction(a)"
                class="w-full rounded-lg border border-tf-border py-2 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
              >
                New workflow with this action
              </button>
              <button
                type="button"
                [disabled]="busy() || (a.pro && !proEntitled())"
                (click)="openAppendModal(a)"
                class="w-full rounded-lg py-2 text-sm text-tf-green hover:underline disabled:opacity-50"
              >
                Add to existing workflow…
              </button>
            </div>
          </div>
        }
      </div>
    </div>

    @if (appendTarget(); as target) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" (click.self)="closeAppendModal()">
        <div class="w-full max-w-md rounded-xl border border-tf-border bg-tf-card p-6 shadow-xl" (click)="$event.stopPropagation()">
          <h2 class="text-lg font-semibold">Add to workflow</h2>
          <p class="mt-1 text-sm text-tf-muted">
            Append <span class="text-neutral-200">{{ target.title }}</span> to the end of an existing workflow.
          </p>
          @if (workflowChoices().length === 0) {
            <p class="mt-4 text-sm text-amber-200/90">No workflows yet. Create one from the Workflows page first.</p>
          } @else {
            <label class="mt-4 block text-xs text-tf-muted">Workflow</label>
            <select
              [(ngModel)]="selectedWorkflowId"
              class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
            >
              @for (w of workflowChoices(); track w.id) {
                <option [ngValue]="w.id">{{ w.name }}</option>
              }
            </select>
          }
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800" (click)="closeAppendModal()">
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
              [disabled]="!selectedWorkflowId || workflowChoices().length === 0 || busy()"
              (click)="confirmAppend()"
            >
              Add &amp; open builder
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ActionsPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  protected readonly basic = BASIC;
  protected readonly advanced = ADVANCED;
  protected readonly usage = signal<Record<string, number>>({});
  protected readonly busy = signal(false);
  protected readonly appendTarget = signal<ActionItem | null>(null);
  protected readonly workflowChoices = signal<WorkflowDto[]>([]);
  protected selectedWorkflowId = '';
  protected readonly proEntitled = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      this.proEntitled.set(unlocked);
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
      const rows = await this.ipc.api.catalog.usageByKind('action');
      const map: Record<string, number> = {};
      for (const r of rows) map[r.kind] = r.count;
      this.usage.set(map);
    } catch {
      this.usage.set({});
    }
  }

  async newWorkflowWithAction(a: ActionItem): Promise<void> {
    this.busy.set(true);
    try {
      const id = await this.ipc.api.workflows.createFromStarter({
        mode: 'action',
        kind: a.kind,
        displayTitle: a.title,
      });
      this.toast.success('Workflow created (includes a default time trigger — edit in builder)');
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

  async openAppendModal(a: ActionItem): Promise<void> {
    const list = await this.ipc.api.workflows.list();
    this.workflowChoices.set(list);
    this.selectedWorkflowId = list[0]?.id ?? '';
    this.appendTarget.set(a);
  }

  closeAppendModal(): void {
    this.appendTarget.set(null);
    this.selectedWorkflowId = '';
  }

  async confirmAppend(): Promise<void> {
    const target = this.appendTarget();
    const wfId = this.selectedWorkflowId;
    if (!target || !wfId) return;
    this.busy.set(true);
    try {
      const ok = await this.ipc.api.workflows.appendNode({
        workflowId: wfId,
        nodeType: 'action',
        kind: target.kind,
      });
      if (!ok) {
        this.toast.error('Could not add action');
        return;
      }
      this.toast.success('Action added');
      this.closeAppendModal();
      await this.reloadUsage();
      void this.router.navigate(['/builder', wfId]);
    } catch (e) {
      if (isEntitlementRequiredError(e)) {
        this.toast.warning('Pro license required. Add your key in Settings.');
        void this.router.navigate(['/settings'], { queryParams: { unlock: '1' } });
        return;
      }
      this.toast.error('Could not add action');
    } finally {
      this.busy.set(false);
    }
  }
}
