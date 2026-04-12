import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { from, merge, switchMap } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { HotkeysService } from '../../core/services/hotkeys.service';
import { isEntitlementRequiredError } from '../../core/utils/entitlement-error';
import { toastAfterManualWorkflowRun } from '../../core/utils/workflow-run-feedback';
import type { WorkflowDto, WorkflowNodeDto } from '../../../types/taskforge-window';
import { NodePickerComponent } from './node-picker/node-picker.component';
import { NodeConfigFormComponent } from './node-config-form/node-config-form.component';
import { catalogEntry } from '../../shared/constants/node-catalog';
import { schemaForKind } from '../../shared/constants/node-schemas';

/** Node card dimensions (canvas units). */
const NW = 224;
const NH = 86;
/** Bezier vertical control-point offset for edge curves. */
const VC = 80;
/** Spacing between auto-laid-out nodes. */
const AUTO_GAP = 140;

interface CanvasEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
}

@Component({
  selector: 'app-builder-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, NodePickerComponent, NodeConfigFormComponent, NgClass],
  styles: [
    `
      :host {
        display: contents;
      }
      .tf-canvas {
        background-color: var(--color-tf-bg);
        background-image: radial-gradient(circle, #333338 1px, transparent 1px);
        background-size: 24px 24px;
        cursor: default;
        touch-action: none;
        user-select: none;
      }
      .tf-canvas.is-panning {
        cursor: grabbing;
      }
      .tf-canvas.is-connecting {
        cursor: crosshair;
      }
    `,
  ],
  template: `
    @if (pickerOpen()) {
      <app-node-picker
        [proUnlocked]="proUnlockedFn"
        (picked)="onPicked($event)"
        (cancel)="pickerOpen.set(false)"
      />
    }

    <!-- Negative-margin wrapper fills parent <main p-6> -->
    <div class="-m-6 flex flex-col" style="height: calc(100vh - 53px)">

      <!-- ── Header ──────────────────────────────────────────────── -->
      <header
        class="flex shrink-0 items-center justify-between gap-3 border-b border-tf-border bg-tf-surface px-4 py-2"
      >
        <div class="flex min-w-0 items-center gap-3">
          <a routerLink="/workflows" class="shrink-0 text-xs text-tf-muted hover:text-tf-green">
            ← Workflows
          </a>
          @if (workflow()) {
            <input
              class="min-w-0 max-w-xs border-none bg-transparent text-sm font-semibold text-neutral-100 outline-none"
              [ngModel]="workflow()!.name"
              (ngModelChange)="patchName($event)"
            />
            <span class="shrink-0 rounded bg-neutral-700 px-2 py-0.5 text-[10px]">
              {{ draft() ? 'Draft' : 'Saved' }}
            </span>
          }
        </div>

        <div class="flex shrink-0 items-center gap-2">
          @if (connectingFrom()) {
            <span class="text-xs text-amber-300">
              Click a target node to connect · <kbd class="text-tf-muted">Esc</kbd> to cancel
            </span>
          }
          @if (selectedEdgeId()) {
            <span class="text-xs text-tf-muted">Edge selected ·</span>
            <button
              type="button"
              class="rounded border border-red-500/30 px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10"
              (click)="removeSelectedEdge()"
            >
              Delete edge
            </button>
          }

          <label class="flex items-center gap-1.5 text-xs text-tf-muted">
            Concurrency
            <select
              [ngModel]="concurrency()"
              (ngModelChange)="concurrency.set($event)"
              class="rounded border border-tf-border bg-tf-bg px-2 py-1 text-xs text-neutral-200"
            >
              <option value="allow">Allow parallel</option>
              <option value="queue">Queue runs</option>
              <option value="skip">Skip if running</option>
            </select>
          </label>

          <button
            type="button"
            (click)="openPicker(-1)"
            class="rounded-lg border border-tf-border px-3 py-1.5 text-xs hover:bg-white/5"
          >
            + Add node
          </button>
          <button
            type="button"
            (click)="testRun()"
            class="rounded-lg border border-tf-border px-3 py-1.5 text-xs hover:bg-white/5"
          >
            Test run
          </button>
          <button
            type="button"
            (click)="save()"
            class="rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-neutral-100"
          >
            Save
          </button>
        </div>
      </header>

      @if (validationBanner().length) {
        <div
          class="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100"
        >
          @for (e of validationBanner(); track e) {
            <div>• {{ e }}</div>
          }
        </div>
      }

      <!-- ── Canvas + config panel ─────────────────────────────── -->
      <div class="flex min-h-0 flex-1 overflow-hidden">

        <!-- Canvas -->
        <div
          #canvasEl
          class="tf-canvas relative flex-1 overflow-hidden"
          [ngClass]="{ 'is-panning': panningActive(), 'is-connecting': !!connectingFrom() }"
          (mousedown)="onCanvasMouseDown($event)"
          (wheel)="onWheel($event)"
          (click)="onCanvasClick()"
        >
          <!-- Transformed world (pan + zoom) -->
          <div
            [style.transform]="worldTransform()"
            style="position: absolute; top: 0; left: 0; transform-origin: 0 0"
          >
            <!-- SVG edge layer (behind node cards) -->
            <svg
              style="
                position: absolute;
                left: 0;
                top: 0;
                width: 10000px;
                height: 10000px;
                overflow: visible;
                pointer-events: none;
              "
            >
              <defs>
                <marker
                  id="tf-arr"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="#22c55e" />
                </marker>
                <marker
                  id="tf-arr-dim"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8 Z" fill="#3f3f47" />
                </marker>
              </defs>

              @for (edge of validEdges(); track edge.id) {
                <!-- Thick transparent hit-area -->
                <path
                  [attr.d]="edgePath(edge)"
                  fill="none"
                  stroke="transparent"
                  stroke-width="16"
                  style="pointer-events: stroke; cursor: pointer"
                  (click)="onEdgeClick($event, edge.id)"
                />
                <!-- Visual curve -->
                <path
                  [attr.d]="edgePath(edge)"
                  fill="none"
                  [attr.stroke]="selectedEdgeId() === edge.id ? '#22c55e' : '#3f3f47'"
                  [attr.stroke-width]="selectedEdgeId() === edge.id ? 2.5 : 1.5"
                  [attr.marker-end]="
                    selectedEdgeId() === edge.id ? 'url(#tf-arr)' : 'url(#tf-arr-dim)'
                  "
                  pointer-events="none"
                />
              }

              <!-- Preview edge while connecting -->
              @if (connectingFrom() && previewPath()) {
                <path
                  [attr.d]="previewPath()"
                  fill="none"
                  stroke="#22c55e"
                  stroke-width="1.5"
                  stroke-dasharray="6 3"
                  marker-end="url(#tf-arr)"
                  pointer-events="none"
                />
              }
            </svg>

            <!-- Node cards -->
            @for (n of nodes(); track n.id) {
              <div
                class="absolute rounded-xl border bg-tf-card shadow-lg"
                [style.left.px]="n.position_x"
                [style.top.px]="n.position_y"
                [style.width.px]="NODE_W"
                [ngClass]="{
                  'border-tf-green ring-1 ring-tf-green/50': selectedId() === n.id && !connectingFrom(),
                  'border-red-500': invalidNodeIds().has(n.id),
                  'border-green-500/40 ring-1 ring-green-500/20':
                    connectingFrom() && connectingFrom() === n.id,
                  'border-tf-border opacity-60':
                    connectingFrom() &&
                    connectingFrom() !== n.id &&
                    selectedId() !== n.id,
                  'border-tf-border':
                    !connectingFrom() &&
                    selectedId() !== n.id &&
                    !invalidNodeIds().has(n.id),
                }"
                (mousedown)="onNodeMouseDown($event, n.id)"
                (click)="onNodeClick($event, n.id)"
              >
                <!-- Input port (top-center) -->
                <div
                  class="absolute -top-2.5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-tf-border bg-tf-bg hover:border-tf-green"
                  style="z-index: 2; cursor: crosshair"
                  title="Input port — connect to this node"
                ></div>

                <!-- Card body -->
                <div class="p-3">
                  <div class="flex items-start gap-2">
                    <span class="text-xl leading-none">{{ icon(n.kind) }}</span>
                    <div class="min-w-0 flex-1">
                      <p
                        class="text-[9px] font-bold uppercase tracking-wider"
                        [ngClass]="{
                          'text-blue-400': n.node_type === 'trigger',
                          'text-amber-400': n.node_type === 'condition',
                          'text-tf-green': n.node_type === 'action',
                        }"
                      >
                        {{ n.node_type }}
                      </p>
                      <p class="truncate text-sm font-medium text-neutral-100">{{ label(n) }}</p>
                      @if (catalogEntry(n.kind); as ce) {
                        <p class="mt-0.5 truncate text-[10px] text-tf-muted">{{ ce.description }}</p>
                      }
                    </div>
                    <!-- Delete node -->
                    <button
                      type="button"
                      class="shrink-0 rounded p-0.5 text-tf-muted hover:text-red-400"
                      (click)="removeNode($event, n.id)"
                      title="Remove node"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      >
                        <path d="M2 2l8 8M10 2L2 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Output port (bottom-center) — drag or click to start connecting -->
                <div
                  class="absolute -bottom-2.5 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border-2 transition-colors hover:bg-tf-green/60"
                  [ngClass]="
                    connectingFrom() === n.id
                      ? 'border-tf-green bg-tf-green/50'
                      : 'border-tf-green/50 bg-tf-green/15'
                  "
                  style="z-index: 2; cursor: crosshair"
                  title="Click and drag to connect"
                  (mousedown)="onPortMouseDown($event, n.id)"
                ></div>
              </div>
            }
          </div>

          <!-- Canvas toolbar (bottom-right overlay) -->
          <div
            class="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-xl border border-tf-border bg-tf-surface/90 px-2.5 py-1.5 shadow-lg backdrop-blur-sm"
          >
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded text-sm text-neutral-400 hover:bg-white/5 hover:text-white"
              (click)="zoomIn()"
              title="Zoom in"
            >
              +
            </button>
            <span class="min-w-[3ch] text-center text-[11px] tabular-nums text-tf-muted">
              {{ zoomPct() }}%
            </span>
            <button
              type="button"
              class="flex h-6 w-6 items-center justify-center rounded text-sm text-neutral-400 hover:bg-white/5 hover:text-white"
              (click)="zoomOut()"
              title="Zoom out"
            >
              −
            </button>
            <div class="mx-1 h-4 w-px bg-tf-border"></div>
            <button
              type="button"
              class="rounded px-2 py-0.5 text-[11px] text-neutral-400 hover:bg-white/5 hover:text-white"
              (click)="fitView()"
              title="Fit all nodes in view"
            >
              Fit
            </button>
            <button
              type="button"
              class="rounded px-2 py-0.5 text-[11px] text-neutral-400 hover:bg-white/5 hover:text-white"
              (click)="autoLayout()"
              title="Auto-arrange nodes vertically"
            >
              Arrange
            </button>
          </div>

          <!-- Empty state -->
          @if (!nodes().length) {
            <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <span class="text-5xl">⚡</span>
              <p class="text-sm font-medium text-neutral-300">No nodes yet</p>
              <p class="text-xs text-tf-muted">Add a trigger to start building your automation</p>
              <button
                type="button"
                (click)="openPicker(-1)"
                class="mt-2 rounded-xl bg-tf-green px-5 py-2 text-sm font-semibold text-black hover:opacity-90"
              >
                + Add first node
              </button>
            </div>
          }
        </div>

        <!-- ── Config panel (right sidebar) ─────────────────────── -->
        @if (selected()) {
          <aside
            class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-tf-border bg-tf-card"
          >
            <div
              class="flex items-center justify-between gap-2 border-b border-tf-border px-4 py-3"
            >
              <div>
                <p
                  class="text-[9px] font-bold uppercase tracking-wider"
                  [ngClass]="{
                    'text-blue-400': selected()!.node_type === 'trigger',
                    'text-amber-400': selected()!.node_type === 'condition',
                    'text-tf-green': selected()!.node_type === 'action',
                  }"
                >
                  {{ selected()!.node_type }}
                </p>
                <h3 class="text-sm font-semibold text-neutral-100">{{ label(selected()!) }}</h3>
              </div>
              <div class="flex items-center gap-2">
                @if (schemaForKind(selected()!.kind)) {
                  <label class="flex items-center gap-1.5 text-xs text-tf-muted">
                    <input type="checkbox" [(ngModel)]="showJson" />
                    JSON
                  </label>
                }
                <button
                  type="button"
                  class="rounded p-1 text-tf-muted hover:text-neutral-300"
                  (click)="selectedId.set(null)"
                  title="Close panel"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  >
                    <path d="M2 2l10 10M12 2L2 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="flex-1 p-4">
              @if (schemaForKind(selected()!.kind) && !showJson) {
                <app-node-config-form
                  [kind]="selected()!.kind"
                  [model]="selectedModel()"
                  (modelChange)="updateSelectedModel($event)"
                />
              } @else {
                <label class="text-xs text-tf-muted">Config (JSON)</label>
                <textarea
                  rows="14"
                  class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg p-2 font-mono text-xs"
                  [ngModel]="selectedConfigText()"
                  (ngModelChange)="updateSelectedConfig($event)"
                ></textarea>
              }
            </div>
          </aside>
        }
      </div>
    </div>
  `,
})
export class BuilderPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly hotkeys = inject(HotkeysService);
  private readonly canvasRef = viewChild<ElementRef<HTMLDivElement>>('canvasEl');

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((pm) => from(this.handleRouteParam(pm.get('id')))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // ── Workflow state ────────────────────────────────────────────
  protected readonly workflow = signal<WorkflowDto | null>(null);
  protected readonly nodes = signal<WorkflowNodeDto[]>([]);
  protected readonly edges = signal<CanvasEdge[]>([]);
  protected readonly draft = signal(true);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selectedEdgeId = signal<string | null>(null);
  protected readonly concurrency = signal<'allow' | 'queue' | 'skip'>('allow');
  protected readonly pickerOpen = signal(false);
  protected readonly insertAfterIndex = signal(-1);
  protected readonly proUnlockedSig = signal(false);
  protected readonly invalidNodeIds = signal<Set<string>>(new Set());
  protected showJson = false;
  private wfId = '';

  // ── Canvas state ──────────────────────────────────────────────
  protected readonly zoom = signal(1);
  protected readonly panX = signal(60);
  protected readonly panY = signal(40);
  protected readonly panningActive = signal(false);
  protected readonly connectingFrom = signal<string | null>(null);
  protected readonly mouseCanvasPos = signal({ x: 0, y: 0 });
  /** Exposed to template for node card width. */
  protected readonly NODE_W = NW;

  // Internal drag/pan bookkeeping (not signals — no rendering side-effects)
  private _isDragging = false;
  private _draggingId = '';
  private _dragOff = { x: 0, y: 0 };
  private _panStart = { mx: 0, my: 0, px: 0, py: 0 };

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

  /** Edges whose both endpoints exist among current nodes. */
  protected readonly validEdges = computed(() => {
    const nodeIds = new Set(this.nodes().map((n) => n.id));
    return this.edges().filter(
      (e) => nodeIds.has(e.source_node_id) && nodeIds.has(e.target_node_id),
    );
  });

  protected catalogEntry = catalogEntry;
  protected schemaForKind = schemaForKind;

  // ── Derived canvas helpers ────────────────────────────────────

  protected worldTransform(): string {
    return `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`;
  }

  protected zoomPct(): number {
    return Math.round(this.zoom() * 100);
  }

  protected edgePath(edge: CanvasEdge): string {
    const src = this.nodes().find((n) => n.id === edge.source_node_id);
    const tgt = this.nodes().find((n) => n.id === edge.target_node_id);
    if (!src || !tgt) return '';
    const sx = src.position_x + NW / 2;
    const sy = src.position_y + NH;
    const tx = tgt.position_x + NW / 2;
    const ty = tgt.position_y;
    return `M ${sx} ${sy} C ${sx} ${sy + VC} ${tx} ${ty - VC} ${tx} ${ty}`;
  }

  protected previewPath(): string {
    const fromId = this.connectingFrom();
    if (!fromId) return '';
    const src = this.nodes().find((n) => n.id === fromId);
    if (!src) return '';
    const { x: tx, y: ty } = this.mouseCanvasPos();
    const sx = src.position_x + NW / 2;
    const sy = src.position_y + NH;
    return `M ${sx} ${sy} C ${sx} ${sy + VC} ${tx} ${ty - VC} ${tx} ${ty}`;
  }

  // ── Global event listeners ────────────────────────────────────

  @HostListener('document:mousemove', ['$event'])
  onDocMouseMove(e: MouseEvent): void {
    if (this._isDragging) {
      const c = this.toCanvasCoords(e);
      this.nodes.update((list) =>
        list.map((n) =>
          n.id === this._draggingId
            ? { ...n, position_x: Math.max(0, c.x - this._dragOff.x), position_y: Math.max(0, c.y - this._dragOff.y) }
            : n,
        ),
      );
    }
    if (this.panningActive()) {
      this.panX.set(this._panStart.px + e.clientX - this._panStart.mx);
      this.panY.set(this._panStart.py + e.clientY - this._panStart.my);
    }
    if (this.connectingFrom()) {
      this.mouseCanvasPos.set(this.toCanvasCoords(e));
    }
  }

  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    if (this._isDragging) {
      this._isDragging = false;
      this._draggingId = '';
      this.draft.set(true);
    }
    if (this.panningActive()) {
      this.panningActive.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(e: KeyboardEvent): void {
    const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape') {
      this.connectingFrom.set(null);
      this.selectedEdgeId.set(null);
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput) {
      if (this.selectedEdgeId()) this.removeSelectedEdge();
    }
  }

  // ── Canvas interactions ───────────────────────────────────────

  protected onCanvasMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    if (this.connectingFrom()) {
      this.connectingFrom.set(null);
      return;
    }
    this.panningActive.set(true);
    this._panStart = { mx: e.clientX, my: e.clientY, px: this.panX(), py: this.panY() };
  }

  protected onCanvasClick(): void {
    this.selectedEdgeId.set(null);
    if (this.connectingFrom()) this.connectingFrom.set(null);
  }

  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    const el = this.canvasRef()?.nativeElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mcx = (mx - this.panX()) / this.zoom();
    const mcy = (my - this.panY()) / this.zoom();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.15, Math.min(3, this.zoom() * factor));
    this.zoom.set(newZoom);
    this.panX.set(mx - mcx * newZoom);
    this.panY.set(my - mcy * newZoom);
  }

  // ── Node interactions ─────────────────────────────────────────

  protected onNodeMouseDown(e: MouseEvent, nodeId: string): void {
    if (e.button !== 0 || this.connectingFrom()) return;
    e.stopPropagation();
    const c = this.toCanvasCoords(e);
    const node = this.nodes().find((n) => n.id === nodeId);
    if (!node) return;
    this._isDragging = true;
    this._draggingId = nodeId;
    this._dragOff = { x: c.x - node.position_x, y: c.y - node.position_y };
  }

  protected onNodeClick(e: MouseEvent, nodeId: string): void {
    e.stopPropagation();
    const from = this.connectingFrom();
    if (from) {
      if (from !== nodeId) this.addEdge(from, nodeId);
      this.connectingFrom.set(null);
      return;
    }
    this.selectedId.set(nodeId);
    this.selectedEdgeId.set(null);
    this.showJson = false;
  }

  protected onPortMouseDown(e: MouseEvent, nodeId: string): void {
    e.stopPropagation();
    e.preventDefault();
    this.connectingFrom.set(nodeId);
    this.mouseCanvasPos.set(this.toCanvasCoords(e));
  }

  protected onEdgeClick(e: MouseEvent, edgeId: string): void {
    e.stopPropagation();
    this.selectedEdgeId.set(edgeId === this.selectedEdgeId() ? null : edgeId);
    this.selectedId.set(null);
  }

  // ── Canvas helpers ────────────────────────────────────────────

  private toCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const el = this.canvasRef()?.nativeElement;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - this.panX()) / this.zoom(),
      y: (e.clientY - rect.top - this.panY()) / this.zoom(),
    };
  }

  protected zoomIn(): void {
    this.zoom.update((z) => Math.min(3, z * 1.2));
  }

  protected zoomOut(): void {
    this.zoom.update((z) => Math.max(0.15, z / 1.2));
  }

  protected fitView(): void {
    const el = this.canvasRef()?.nativeElement;
    const ns = this.nodes();
    if (!el || !ns.length) {
      this.panX.set(60);
      this.panY.set(40);
      this.zoom.set(1);
      return;
    }
    const rect = el.getBoundingClientRect();
    const xs = ns.map((n) => n.position_x);
    const ys = ns.map((n) => n.position_y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs) + NW;
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys) + NH;
    const cW = maxX - minX;
    const cH = maxY - minY;
    const margin = 80;
    const newZoom = Math.max(
      0.15,
      Math.min(1.5, Math.min((rect.width - margin * 2) / cW, (rect.height - margin * 2) / cH)),
    );
    this.zoom.set(newZoom);
    this.panX.set((rect.width - cW * newZoom) / 2 - minX * newZoom);
    this.panY.set((rect.height - cH * newZoom) / 2 - minY * newZoom);
  }

  protected autoLayout(): void {
    this.nodes.update((list) =>
      list.map((n, i) => ({ ...n, position_x: 80, position_y: 60 + i * AUTO_GAP })),
    );
    this.draft.set(true);
    setTimeout(() => this.fitView(), 0);
  }

  private addEdge(sourceId: string, targetId: string): void {
    if (sourceId === targetId) return;
    if (this.edges().some((e) => e.source_node_id === sourceId && e.target_node_id === targetId))
      return;
    this.edges.update((list) => [
      ...list,
      { id: crypto.randomUUID(), source_node_id: sourceId, target_node_id: targetId },
    ]);
    this.draft.set(true);
  }

  protected removeSelectedEdge(): void {
    const id = this.selectedEdgeId();
    if (!id) return;
    this.edges.update((list) => list.filter((e) => e.id !== id));
    this.selectedEdgeId.set(null);
    this.draft.set(true);
  }

  protected removeNode(e: MouseEvent, nodeId: string): void {
    e.stopPropagation();
    this.nodes.update((list) => list.filter((n) => n.id !== nodeId));
    this.edges.update((list) =>
      list.filter((ed) => ed.source_node_id !== nodeId && ed.target_node_id !== nodeId),
    );
    if (this.selectedId() === nodeId) this.selectedId.set(null);
    this.draft.set(true);
  }

  // ── Lifecycle & routing ───────────────────────────────────────

  async ngOnInit(): Promise<void> {
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      this.proUnlockedSig.set(unlocked);
    } catch {
      this.proUnlockedSig.set(false);
    }
    if (this.ipc.isElectron) {
      try {
        const def = await this.ipc.api.settings.get('builder_show_json_default');
        if (def === '1' || def === 'true') this.showJson = true;
      } catch {
        /* ignore */
      }
    }
    merge(
      this.hotkeys.saveBuilder$.pipe(switchMap(async () => this.save())),
      this.hotkeys.testRunBuilder$.pipe(switchMap(async () => this.testRun())),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  private async handleRouteParam(rawId: string | null): Promise<void> {
    let id = rawId ?? '';
    if (id === 'new') {
      try {
        id = await this.ipc.api.workflows.create({ name: 'Untitled workflow', description: '' });
        await this.router.navigate(['/builder', id], { replaceUrl: true });
      } catch {
        this.toast.error('Could not create workflow');
        void this.router.navigate(['/workflows']);
      }
      return;
    }
    if (!id.trim()) {
      void this.router.navigate(['/workflows']);
      return;
    }
    this.wfId = id;
    this.workflow.set(null);
    this.nodes.set([]);
    this.edges.set([]);
    this.selectedId.set(null);
    this.selectedEdgeId.set(null);
    await this.load();
  }

  private async load(): Promise<void> {
    const expectId = this.wfId;
    try {
      const data = await this.ipc.api.workflows.get(expectId);
      if (expectId !== this.wfId) return;
      if (!data) {
        this.toast.warning('Workflow not found.');
        void this.router.navigate(['/workflows']);
        return;
      }
      this.workflow.set(data.workflow);
      const sorted = [...data.nodes].sort((a, b) => a.sort_order - b.sort_order);
      /* Auto-layout when all nodes are at the origin (new workflow or imported). */
      if (sorted.length && sorted.every((n) => n.position_x === 0 && n.position_y === 0)) {
        sorted.forEach((n, i) => {
          n.position_x = 80;
          n.position_y = 60 + i * AUTO_GAP;
        });
      }
      this.nodes.set(sorted);
      this.edges.set((data.edges ?? []) as CanvasEdge[]);
      this.draft.set(!!data.workflow.draft);
      const c = (data.workflow as WorkflowDto & { concurrency?: string }).concurrency;
      this.concurrency.set(c === 'queue' || c === 'skip' ? c : 'allow');
      /* Fit after first render. */
      setTimeout(() => this.fitView(), 60);
    } catch {
      if (expectId !== this.wfId) return;
      this.toast.error('Could not load workflow.');
      void this.router.navigate(['/workflows']);
    }
  }

  // ── Node content helpers ──────────────────────────────────────

  protected label(n: WorkflowNodeDto): string {
    try {
      return (JSON.parse(n.config) as { label?: string }).label ?? n.kind.replace(/_/g, ' ');
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

  protected openPicker(afterIndex: number): void {
    this.insertAfterIndex.set(afterIndex);
    this.pickerOpen.set(true);
  }

  protected onPicked(ev: {
    nodeType: 'trigger' | 'condition' | 'action';
    kind: string;
    config: Record<string, unknown>;
  }): void {
    this.pickerOpen.set(false);
    const list = [...this.nodes()];

    /* Place new node below the last one (or at origin if canvas is empty). */
    const maxY = list.length ? Math.max(...list.map((n) => n.position_y)) : -AUTO_GAP;
    const newNode: WorkflowNodeDto = {
      id: crypto.randomUUID(),
      workflow_id: this.wfId,
      node_type: ev.nodeType,
      kind: ev.kind,
      config: JSON.stringify(ev.config),
      position_x: 80,
      position_y: maxY + AUTO_GAP,
      sort_order: 0,
    };

    const after = this.insertAfterIndex();
    const pos = after < 0 ? list.length : after + 1;
    list.splice(pos, 0, newNode);
    list.forEach((n, i) => (n.sort_order = i));
    this.nodes.set(list);

    /* Auto-connect: link previous node's output to this node's input. */
    if (pos > 0) {
      const prevNode = list[pos - 1];
      if (prevNode.id !== newNode.id) this.addEdge(prevNode.id, newNode.id);
    }

    this.selectedId.set(newNode.id);
    this.selectedEdgeId.set(null);
    this.showJson = false;
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

  // ── Validation ────────────────────────────────────────────────

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
        msgs.push(`Node "${this.label(n)}" has invalid JSON.`);
        bad.add(n.id);
        continue;
      }
      if (n.kind === 'time_schedule') {
        if (String(cfg['cron'] ?? '').trim().split(/\s+/).length < 5) {
          msgs.push(`Time schedule "${this.label(n)}" needs a 5-field cron expression.`);
          bad.add(n.id);
        }
      }
      if (n.kind === 'file_change' && !String(cfg['path'] ?? '').trim()) {
        msgs.push(`File trigger "${this.label(n)}" needs a watch path.`);
        bad.add(n.id);
      }
      if (n.kind === 'http_request' && !String(cfg['url'] ?? '').trim()) {
        msgs.push(`HTTP action "${this.label(n)}" needs a URL.`);
        bad.add(n.id);
      }
      if (n.kind === 'zip_archive') {
        if (!String(cfg['outputPath'] ?? '').trim()) {
          msgs.push(`ZIP action "${this.label(n)}" needs an output .zip path.`);
          bad.add(n.id);
        }
        const src = cfg['sources'];
        if (
          !((typeof src === 'string' && src.trim()) || (Array.isArray(src) && src.length > 0))
        ) {
          msgs.push(`ZIP action "${this.label(n)}" needs at least one source path.`);
          bad.add(n.id);
        }
      }
      if (n.kind === 'download_file') {
        if (!String(cfg['url'] ?? '').trim() || !String(cfg['destinationPath'] ?? '').trim()) {
          msgs.push(`Download file "${this.label(n)}" needs URL and destination path.`);
          bad.add(n.id);
        }
      }
      if (n.kind === 'wake_on_lan' && !String(cfg['macAddress'] ?? '').trim()) {
        msgs.push(`Wake-on-LAN "${this.label(n)}" needs a MAC address.`);
        bad.add(n.id);
      }
      if (n.kind === 'tcp_port_check') {
        const p = Number(cfg['port'] ?? 0);
        if (!Number.isFinite(p) || p < 1 || p > 65535) {
          msgs.push(`TCP port check "${this.label(n)}" needs a valid port (1–65535).`);
          bad.add(n.id);
        }
      }
      if (n.kind === 'screenshot_save' && !String(cfg['path'] ?? '').trim()) {
        msgs.push(`Screenshot "${this.label(n)}" needs an output PNG path.`);
        bad.add(n.id);
      }
      if (n.kind === 'app_launch' && !String(cfg['process'] ?? '').trim()) {
        msgs.push(`App launch trigger "${this.label(n)}" needs a process name.`);
        bad.add(n.id);
      }
      if (n.kind === 'interval_trigger') {
        const im = Number(cfg['intervalMinutes'] ?? 0);
        if (!Number.isFinite(im) || im < 1 || im > 1440) {
          msgs.push(
            `Interval trigger "${this.label(n)}" needs interval minutes between 1 and 1440.`,
          );
          bad.add(n.id);
        }
      }
      if (n.kind === 'open_url' && !String(cfg['url'] ?? '').trim()) {
        msgs.push(`Open URL action "${this.label(n)}" needs a URL.`);
        bad.add(n.id);
      }
      if (n.kind === 'write_text_file' && !String(cfg['path'] ?? '').trim()) {
        msgs.push(`Write text file "${this.label(n)}" needs a file path.`);
        bad.add(n.id);
      }
    }
    return { msgs, bad };
  }

  // ── Save / run ────────────────────────────────────────────────

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
      const nodePayload = this.nodes().map((n) => ({
        id: n.id,
        node_type: n.node_type,
        kind: n.kind,
        config: typeof n.config === 'string' ? JSON.parse(n.config) : n.config,
        position_x: Math.round(n.position_x),
        position_y: Math.round(n.position_y),
        sort_order: n.sort_order,
      }));
      const payload: Record<string, unknown> = {
        id: this.wfId,
        name: w.name,
        draft: false,
        concurrency: this.concurrency(),
        nodes: nodePayload,
        /* Send actual graph edges (not synthesized linear chain). */
        edges: this.edges().map((e) => ({
          id: e.id,
          source_node_id: e.source_node_id,
          target_node_id: e.target_node_id,
        })),
      };
      const ok = await this.ipc.api.workflows.update(
        JSON.parse(JSON.stringify(payload)) as Record<string, unknown>,
      );
      if (!ok) {
        this.toast.error('Save failed — workflow was not found.');
        return;
      }
      this.draft.set(false);
      this.invalidNodeIds.set(new Set());
      await this.load();
      this.toast.success('Workflow saved');
    } catch (e) {
      if (isEntitlementRequiredError(e)) {
        this.toast.warning(
          'Pro license required to save workflows that use Pro triggers or actions.',
        );
        void this.router.navigate(['/settings'], { queryParams: { unlock: '1' } });
        return;
      }
      throw e;
    }
  }

  async testRun(): Promise<void> {
    const logId = await this.ipc.api.engine.runWorkflow(this.wfId);
    await toastAfterManualWorkflowRun(this.ipc.api, logId, this.toast);
  }
}
