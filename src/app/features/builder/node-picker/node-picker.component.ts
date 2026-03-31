import { Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NODE_CATALOG, type CatalogNodeType, type NodeCatalogEntry } from '../../../shared/constants/node-catalog';
import { defaultActionConfig, defaultConditionConfig, defaultTriggerConfig } from '../../../shared/constants/catalog-defaults';

function defaultConfigForKind(nodeType: CatalogNodeType, kind: string): Record<string, unknown> {
  if (nodeType === 'trigger') return { ...defaultTriggerConfig(kind) };
  if (nodeType === 'action') return { ...defaultActionConfig(kind) };
  return { ...defaultConditionConfig(kind) };
}

@Component({
  selector: 'app-node-picker',
  imports: [FormsModule],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" (click.self)="cancel.emit()">
      <div
        class="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-tf-border bg-tf-card shadow-xl"
        (click)="$event.stopPropagation()"
      >
        <div class="border-b border-tf-border p-4">
          <h2 class="text-sm font-semibold">Add node</h2>
          <input
            type="search"
            [(ngModel)]="q"
            placeholder="Search…"
            class="mt-3 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
          />
          <div class="mt-2 flex flex-wrap gap-2 text-xs">
            @for (t of typeFilters; track t.v) {
              <button
                type="button"
                (click)="typeFilter.set(t.v)"
                class="rounded-full border px-2 py-1"
                [class.border-tf-green]="typeFilter() === t.v"
                [class.bg-tf-green]="typeFilter() === t.v"
                [class.text-black]="typeFilter() === t.v"
                [class.border-tf-border]="typeFilter() !== t.v"
              >
                {{ t.label }}
              </button>
            }
          </div>
        </div>
        <div class="max-h-[55vh] overflow-y-auto p-2">
          @for (g of grouped(); track g.cat) {
            <p class="px-2 py-2 text-[10px] font-semibold uppercase text-tf-muted">{{ g.cat }}</p>
            @for (e of g.items; track e.kind) {
              <button
                type="button"
                (click)="pick(e)"
                [disabled]="e.tier === 'pro' && !proUnlocked()"
                class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-tf-bg disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span class="text-xl">{{ e.icon }}</span>
                <span class="min-w-0 flex-1">
                  <span class="font-medium">{{ e.label }}</span>
                  <span class="mt-0.5 block text-xs text-tf-muted">{{ e.description }}</span>
                </span>
                @if (e.tier === 'pro') {
                  <span class="shrink-0 rounded bg-tf-green/20 px-1.5 py-0.5 text-[10px] text-tf-green">Pro</span>
                }
              </button>
            }
          }
        </div>
        <div class="flex justify-end border-t border-tf-border p-3">
          <button type="button" class="rounded-lg px-4 py-2 text-sm text-tf-muted hover:text-white" (click)="cancel.emit()">
            Cancel
          </button>
        </div>
      </div>
    </div>
  `,
})
export class NodePickerComponent {
  @Input({ required: true }) proUnlocked!: () => boolean;
  @Output() readonly picked = new EventEmitter<{
    nodeType: CatalogNodeType;
    kind: string;
    config: Record<string, unknown>;
  }>();
  @Output() readonly cancel = new EventEmitter<void>();

  protected q = '';
  protected readonly typeFilter = signal<'all' | CatalogNodeType>('all');
  protected readonly typeFilters: { v: 'all' | CatalogNodeType; label: string }[] = [
    { v: 'all', label: 'All' },
    { v: 'trigger', label: 'Triggers' },
    { v: 'condition', label: 'Conditions' },
    { v: 'action', label: 'Actions' },
  ];

  protected readonly grouped = computed(() => {
    const query = this.q.trim().toLowerCase();
    const tf = this.typeFilter();
    let list = [...NODE_CATALOG];
    if (tf !== 'all') list = list.filter((e) => e.nodeType === tf);
    if (query) {
      list = list.filter(
        (e) =>
          e.label.toLowerCase().includes(query) ||
          e.kind.includes(query) ||
          e.description.toLowerCase().includes(query)
      );
    }
    const byCat = new Map<string, NodeCatalogEntry[]>();
    for (const e of list) {
      const arr = byCat.get(e.category) ?? [];
      arr.push(e);
      byCat.set(e.category, arr);
    }
    return [...byCat.entries()].map(([cat, items]) => ({ cat, items })).sort((a, b) => a.cat.localeCompare(b.cat));
  });

  pick(e: NodeCatalogEntry): void {
    const config = defaultConfigForKind(e.nodeType, e.kind);
    this.picked.emit({ nodeType: e.nodeType, kind: e.kind, config });
  }
}
