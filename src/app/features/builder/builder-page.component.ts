import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { HotkeysService } from '../../core/services/hotkeys.service';
import { isEntitlementRequiredError } from '../../core/utils/entitlement-error';
import type { WorkflowDto, WorkflowNodeDto } from '../../../types/taskforge-window';
import { NodePickerComponent } from './node-picker/node-picker.component';
import { NodeConfigFormComponent } from './node-config-form/node-config-form.component';
import { catalogEntry } from '../../shared/constants/node-catalog';
import { schemaForKind } from '../../shared/constants/node-schemas';

@Component({
  selector: 'app-builder-page',
  imports: [FormsModule, DragDropModule, RouterLink, NodePickerComponent, NodeConfigFormComponent],
  template: `
    @if (pickerOpen()) {
      <app-node-picker [proUnlocked]="proUnlockedFn" (picked)="onPicked($event)" (cancel)="pickerOpen.set(false)" />
    }
    @if (!workflow()) {
      <p class="text-tf-muted">Loading…</p>
    } @else {
      <div class="mx-auto max-w-lg">
        <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <a routerLink="/workflows" class="text-xs text-tf-muted hover:text-tf-green">← Workflows</a>
            <input
              class="mt-1 block w-full border-none bg-transparent text-lg font-semibold outline-none"
              [ngModel]="workflow()!.name"
              (ngModelChange)="patchName($event)"
            />
            <div class="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span class="rounded bg-neutral-700 px-2 py-0.5">{{ draft() ? 'Draft' : 'Saved' }}</span>
              <label class="flex items-center gap-1 text-tf-muted">
                <input type="checkbox" [(ngModel)]="debugMode" /> Debug
              </label>
              <label class="flex items-center gap-2 text-tf-muted">
                Concurrency
                <select
                  [ngModel]="concurrency()"
                  (ngModelChange)="concurrency.set($event)"
                  class="rounded border border-tf-border bg-tf-bg px-2 py-1 text-neutral-200"
                >
                  <option value="allow">Allow parallel</option>
                  <option value="queue">Queue runs</option>
                  <option value="skip">Skip if running</option>
                </select>
              </label>
            </div>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              (click)="openPicker(-1)"
              class="rounded-lg border border-tf-border px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              + Add node
            </button>
            <button
              type="button"
              (click)="testRun()"
              class="rounded-lg border border-tf-border px-3 py-1.5 text-sm hover:bg-neutral-800"
            >
              Test Run
            </button>
            <button
              type="button"
              (click)="save()"
              class="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-black hover:bg-neutral-200"
            >
              Save
            </button>
          </div>
        </div>

        @if (validationBanner().length) {
          <div class="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            @for (e of validationBanner(); track e) {
              <div>• {{ e }}</div>
            }
          </div>
        }

        <div cdkDropList (cdkDropListDropped)="drop($event)" class="flex flex-col gap-0">
          @for (n of nodes(); track n.id; let i = $index) {
            <div class="flex flex-col items-center">
              <div
                cdkDrag
                class="flex w-full cursor-grab rounded-xl border bg-tf-card p-4 active:cursor-grabbing"
                [class.border-red-500]="invalidNodeIds().has(n.id)"
                [class.border-tf-border]="!invalidNodeIds().has(n.id)"
                [class.ring-1]="selectedId() === n.id"
                [class.ring-tf-green]="selectedId() === n.id"
                (click)="select(n.id)"
              >
                <div class="mr-3 text-neutral-500" cdkDragHandle>⋮⋮</div>
                <div class="flex-1">
                  <p class="text-[10px] font-bold uppercase tracking-wider text-tf-muted">{{ n.node_type }}</p>
                  <p class="font-medium">{{ label(n) }}</p>
                  @if (catalogEntry(n.kind); as ce) {
                    <p class="mt-0.5 text-[10px] text-tf-muted">{{ ce.description }}</p>
                  }
                </div>
                <span class="text-xl text-tf-green">{{ icon(n.kind) }}</span>
              </div>
              <button
                type="button"
                (click)="openPicker(i)"
                class="z-10 -my-2 flex h-8 w-8 items-center justify-center rounded-full border border-tf-border bg-tf-bg text-lg leading-none text-tf-green hover:bg-tf-card"
              >
                +
              </button>
            </div>
          }
        </div>

        @if (selected()) {
          <div class="mt-6 rounded-xl border border-tf-border bg-tf-card p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-semibold">Node settings</h3>
              @if (schemaForKind(selected()!.kind)) {
                <label class="flex items-center gap-2 text-xs text-tf-muted">
                  <input type="checkbox" [(ngModel)]="showJson" /> Show JSON
                </label>
              }
            </div>
            @if (schemaForKind(selected()!.kind) && !showJson) {
              <app-node-config-form
                class="mt-3 block"
                [kind]="selected()!.kind"
                [model]="selectedModel()"
                (modelChange)="updateSelectedModel($event)"
              />
            } @else {
              <label class="mt-3 block text-xs text-tf-muted">Config (JSON)</label>
              <textarea
                rows="8"
                class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg p-2 font-mono text-xs"
                [ngModel]="selectedConfigText()"
                (ngModelChange)="updateSelectedConfig($event)"
              ></textarea>
            }
          </div>
        }
      </div>
    }
  `,
})
export class BuilderPageComponent implements OnInit, OnDestroy {
  private readonly ipc = inject(IpcService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly hotkeys = inject(HotkeysService);
  private hotkeySubs: Subscription[] = [];

  protected readonly workflow = signal<WorkflowDto | null>(null);
  protected readonly nodes = signal<WorkflowNodeDto[]>([]);
  protected readonly draft = signal(true);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly concurrency = signal<'allow' | 'queue' | 'skip'>('allow');
  protected readonly pickerOpen = signal(false);
  protected readonly insertAfterIndex = signal(-1);
  protected readonly proUnlockedSig = signal(false);
  protected readonly invalidNodeIds = signal<Set<string>>(new Set());
  protected debugMode = false;
  protected showJson = false;
  private wfId = '';

  protected readonly proUnlockedFn = () => this.proUnlockedSig();

  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id ? this.nodes().find((x) => x.id === id) : undefined;
  });

  protected readonly selectedModel = computed(() => {
    const n = this.selected();
    if (!n) return {};
    try {
      return JSON.parse(n.config) as Record<string, unknown>;
    } catch {
      return {};
    }
  });

  protected readonly validationBanner = computed(() => this.computeValidationIssues().msgs);

  protected catalogEntry = catalogEntry;
  protected schemaForKind = schemaForKind;

  async ngOnInit(): Promise<void> {
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      this.proUnlockedSig.set(unlocked);
    } catch {
      this.proUnlockedSig.set(false);
    }

    let id = this.route.snapshot.paramMap.get('id') ?? '';
    if (id === 'new') {
      id = await this.ipc.api.workflows.create({ name: 'Untitled workflow', description: '' });
      await this.router.navigate(['/builder', id], { replaceUrl: true });
    }
    this.wfId = id;
    await this.load();
    this.hotkeySubs = [
      this.hotkeys.saveBuilder$.subscribe(() => void this.save()),
      this.hotkeys.testRunBuilder$.subscribe(() => void this.testRun()),
    ];
  }

  ngOnDestroy(): void {
    for (const s of this.hotkeySubs) s.unsubscribe();
  }

  private async load(): Promise<void> {
    const data = await this.ipc.api.workflows.get(this.wfId);
    if (!data) return;
    this.workflow.set(data.workflow);
    this.nodes.set([...data.nodes].sort((a, b) => a.sort_order - b.sort_order));
    this.draft.set(!!data.workflow.draft);
    const c = (data.workflow as WorkflowDto & { concurrency?: string }).concurrency;
    this.concurrency.set(c === 'queue' || c === 'skip' ? c : 'allow');
  }

  protected label(n: WorkflowNodeDto): string {
    try {
      const c = JSON.parse(n.config) as { label?: string };
      return c.label ?? n.kind.replace(/_/g, ' ');
    } catch {
      return n.kind;
    }
  }

  protected icon(kind: string): string {
    return catalogEntry(kind)?.icon ?? '⚡';
  }

  protected patchName(name: string): void {
    const w = this.workflow();
    if (w) this.workflow.set({ ...w, name });
  }

  protected select(id: string): void {
    this.selectedId.set(id);
    this.showJson = false;
  }

  protected openPicker(afterIndex: number): void {
    this.insertAfterIndex.set(afterIndex);
    this.pickerOpen.set(true);
  }

  protected onPicked(ev: { nodeType: 'trigger' | 'condition' | 'action'; kind: string; config: Record<string, unknown> }): void {
    this.pickerOpen.set(false);
    const list = [...this.nodes()];
    const after = this.insertAfterIndex();
    const newNode: WorkflowNodeDto = {
      id: crypto.randomUUID(),
      workflow_id: this.wfId,
      node_type: ev.nodeType,
      kind: ev.kind,
      config: JSON.stringify(ev.config),
      position_x: 0,
      position_y: 0,
      sort_order: 0,
    };
    const pos = after < 0 ? 0 : after + 1;
    list.splice(pos, 0, newNode);
    list.forEach((n, i) => (n.sort_order = i));
    this.nodes.set(list);
    this.select(newNode.id);
    this.draft.set(true);
  }

  protected updateSelectedConfig(text: string): void {
    const id = this.selectedId();
    if (!id) return;
    this.nodes.update((list) => list.map((n) => (n.id === id ? { ...n, config: text } : n)));
  }

  protected updateSelectedModel(model: Record<string, unknown>): void {
    const id = this.selectedId();
    if (!id) return;
    let text: string;
    try {
      text = JSON.stringify(model, null, 2);
    } catch {
      text = '{}';
    }
    this.nodes.update((list) => list.map((n) => (n.id === id ? { ...n, config: text } : n)));
  }

  protected selectedConfigText(): string {
    const n = this.selected();
    if (!n) return '';
    try {
      return JSON.stringify(JSON.parse(n.config), null, 2);
    } catch {
      return n.config;
    }
  }

  protected drop(event: CdkDragDrop<WorkflowNodeDto[]>): void {
    const list = [...this.nodes()];
    moveItemInArray(list, event.previousIndex, event.currentIndex);
    list.forEach((n, i) => (n.sort_order = i));
    this.nodes.set(list);
  }

  private computeValidationIssues(): { msgs: string[]; bad: Set<string> } {
    const msgs: string[] = [];
    const bad = new Set<string>();
    const list = this.nodes();
    const triggers = list.filter((n) => n.node_type === 'trigger');
    const actions = list.filter((n) => n.node_type === 'action');
    if (triggers.length === 0) msgs.push('Add at least one trigger so the workflow can run.');
    if (actions.length === 0) msgs.push('Add at least one action.');
    const startups = triggers.filter((n) => n.kind === 'system_startup');
    if (startups.length > 1) {
      msgs.push('Only one system startup trigger is recommended.');
      startups.forEach((n) => bad.add(n.id));
    }
    for (const n of list) {
      let cfg: Record<string, unknown> = {};
      try {
        cfg = JSON.parse(n.config) as Record<string, unknown>;
      } catch {
        msgs.push(`Node “${this.label(n)}” has invalid JSON.`);
        bad.add(n.id);
        continue;
      }
      if (n.kind === 'time_schedule') {
        const c = String(cfg['cron'] ?? '').trim().split(/\s+/);
        if (c.length < 5) {
          msgs.push(`Time schedule “${this.label(n)}” needs a 5-field cron expression.`);
          bad.add(n.id);
        }
      }
      if (n.kind === 'file_change' && !String(cfg['path'] ?? '').trim()) {
        msgs.push(`File trigger “${this.label(n)}” needs a watch path.`);
        bad.add(n.id);
      }
      if (n.kind === 'http_request' && !String(cfg['url'] ?? '').trim()) {
        msgs.push(`HTTP action “${this.label(n)}” needs a URL.`);
        bad.add(n.id);
      }
      if (n.kind === 'app_launch' && !String(cfg['process'] ?? '').trim()) {
        msgs.push(`App launch trigger “${this.label(n)}” needs a process name.`);
        bad.add(n.id);
      }
    }
    return { msgs, bad };
  }

  async save(): Promise<void> {
    const w = this.workflow();
    if (!w) return;
    const { msgs, bad } = this.computeValidationIssues();
    this.invalidNodeIds.set(bad);
    if (msgs.length) {
      this.toast.warning('Fix validation issues before saving.');
      return;
    }
    try {
      await this.ipc.api.workflows.update({
        id: this.wfId,
        name: w.name,
        draft: false,
        concurrency: this.concurrency(),
        nodes: this.nodes().map((n) => ({
          id: n.id,
          node_type: n.node_type,
          kind: n.kind,
          config: typeof n.config === 'string' ? JSON.parse(n.config) : n.config,
          position_x: n.position_x,
          position_y: n.position_y,
          sort_order: n.sort_order,
        })),
        edges: [],
      });
      this.draft.set(false);
      this.invalidNodeIds.set(new Set());
      await this.load();
      this.toast.success('Workflow saved');
    } catch (e) {
      if (isEntitlementRequiredError(e)) {
        this.toast.warning('Pro license required to save workflows that use Pro triggers or actions. Add your key in Settings.');
        void this.router.navigate(['/settings'], { queryParams: { unlock: '1' } });
        return;
      }
      throw e;
    }
  }

  async testRun(): Promise<void> {
    await this.ipc.api.engine.runWorkflow(this.wfId);
    this.toast.success('Run finished — check Logs');
  }
}
