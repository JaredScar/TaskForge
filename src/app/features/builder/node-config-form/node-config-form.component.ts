import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CronBuilderComponent } from '../cron-builder/cron-builder.component';
import { schemaForKind, type SchemaField } from '../../../shared/constants/node-schemas';
import { IpcService } from '../../../core/services/ipc.service';

@Component({
  selector: 'app-node-config-form',
  imports: [FormsModule, CronBuilderComponent],
  template: `
    @if (fields().length === 0) {
      <p class="text-xs text-tf-muted">No form schema for this node — use JSON.</p>
    } @else {
      <div class="space-y-3">
        @for (f of fields(); track f.key) {
          <div>
            @if (f.type !== 'cron') {
              <label class="block text-xs text-tf-muted">{{ f.label }}</label>
            }
            @switch (f.type) {
              @case ('text') {
                <input
                  [ngModel]="strVal(f.key)"
                  (ngModelChange)="setStr(f.key, $event)"
                  [attr.list]="varListId"
                  class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-2 py-1.5 text-sm"
                  [placeholder]="f.placeholder ?? ''"
                />
              }
              @case ('number') {
                <input
                  type="number"
                  [ngModel]="numVal(f.key)"
                  (ngModelChange)="setNum(f.key, $event)"
                  class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-2 py-1.5 text-sm"
                />
              }
              @case ('boolean') {
                <label class="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" [ngModel]="boolVal(f.key)" (ngModelChange)="setBool(f.key, $event)" />
                  {{ f.label }}
                </label>
              }
              @case ('select') {
                <select
                  [ngModel]="strVal(f.key)"
                  (ngModelChange)="setStr(f.key, $event)"
                  class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-2 py-1.5 text-sm"
                >
                  @for (o of f.options ?? []; track o.value) {
                    <option [value]="o.value">{{ o.label }}</option>
                  }
                </select>
              }
              @case ('textarea') {
                <textarea
                  [ngModel]="strVal(f.key)"
                  (ngModelChange)="setStr(f.key, $event)"
                  rows="3"
                  [attr.list]="varListId"
                  class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-2 py-1.5 font-mono text-xs"
                ></textarea>
              }
              @case ('cron') {
                <app-cron-builder class="mt-1 block" [cron]="strVal('cron')" (cronChange)="setStr('cron', $event)" />
              }
            }
          </div>
        }
      </div>
      @if (varNames().length) {
        <datalist [id]="varListId">
          @for (v of varNames(); track v) {
            <option [value]="varToken(v)"></option>
          }
        </datalist>
      }
    }
  `,
})
export class NodeConfigFormComponent implements OnChanges {
  private readonly ipc = inject(IpcService);

  @Input({ required: true }) kind = '';
  /** Parsed config object (mutable copy in parent via events). */
  @Input() model: Record<string, unknown> = {};
  @Output() readonly modelChange = new EventEmitter<Record<string, unknown>>();

  protected readonly fields = signal<SchemaField[]>([]);
  protected readonly varNames = signal<string[]>([]);
  protected readonly varListId = 'tf-var-suggest-' + Math.random().toString(36).slice(2, 9);

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['kind']) {
      this.fields.set(schemaForKind(this.kind) ?? []);
    }
    if (ch['kind'] && this.ipc.isElectron) {
      void this.loadVarNames();
    }
  }

  private async loadVarNames(): Promise<void> {
    try {
      const rows = (await this.ipc.api.variables.list()) as Array<{ name: string }>;
      this.varNames.set(rows.map((r) => r.name).filter(Boolean));
    } catch {
      this.varNames.set([]);
    }
  }

  strVal(key: string): string {
    const v = this.model[key];
    return v == null ? '' : String(v);
  }

  numVal(key: string): number {
    const v = this.model[key];
    return typeof v === 'number' ? v : Number(v) || 0;
  }

  boolVal(key: string): boolean {
    return !!this.model[key];
  }

  setStr(key: string, v: string): void {
    this.patch({ [key]: v });
  }

  setNum(key: string, v: number): void {
    this.patch({ [key]: v });
  }

  setBool(key: string, v: boolean): void {
    this.patch({ [key]: v });
  }

  private patch(p: Record<string, unknown>): void {
    const next = { ...this.model, ...p };
    this.modelChange.emit(next);
  }

  varToken(name: string): string {
    return `{{${name}}}`;
  }
}
