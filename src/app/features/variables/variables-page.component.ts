import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

type VarRow = Record<string, unknown> & {
  id: string;
  name: string;
  type: string;
  value: string;
  is_secret: number;
  scope: string;
  description?: string;
};

type VariableFormModel = {
  name: string;
  type: string;
  value: string;
  is_secret: boolean;
  description: string;
};

const NAME_MAX = 64;
const DESC_MAX = 500;
/** Safe for `{{name}}` interpolation — letters, digits, underscore; must start with a letter. */
const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

@Component({
  selector: 'app-variables-page',
  imports: [FormsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .tf-var-field-invalid {
        border-color: rgba(248, 113, 113, 0.75) !important;
      }
    `,
  ],
  template: `
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">Variables</h1>
          <p class="mt-1 text-sm text-tf-muted">
            Reusable values for <code class="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[11px] text-neutral-300">{{ '{' }}{{ '{' }}NAME{{ '}' }}{{ '}' }}</code> in workflow configs — validated names reduce mistakes.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex cursor-pointer items-center gap-2 text-sm text-tf-muted">
            <input type="checkbox" [(ngModel)]="showSecrets" class="rounded border-tf-border" />
            Show secret values
          </label>
          <button
            type="button"
            (click)="openAddModal()"
            class="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Add variable
          </button>
        </div>
      </div>
      @if (list().length === 0) {
        <app-empty-state
          icon="🔤"
          title="No variables yet"
          description="Create a variable, then reference it from node configs as {{ '{' }}{{ '{' }}YOUR_NAME{{ '}' }}{{ '}' }}. Use letters, numbers, and underscores only in the name."
        />
        <div class="mt-4 flex justify-center">
          <button
            type="button"
            (click)="openAddModal()"
            class="rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black hover:opacity-90"
          >
            + Add your first variable
          </button>
        </div>
      } @else {
        <div class="mt-6 space-y-3">
          @for (v of list(); track v.id) {
            <div class="rounded-xl border border-tf-border bg-tf-card p-4 shadow-sm transition-colors hover:border-neutral-600">
              @if (editingId() === v.id) {
                <div class="space-y-5">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <h3 class="text-sm font-semibold text-neutral-100">Edit variable</h3>
                    <div class="flex gap-2">
                      <button
                        type="button"
                        class="rounded-lg border border-tf-border px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800"
                        (click)="cancelEdit()"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        class="rounded-lg bg-tf-green px-3 py-1.5 text-sm font-medium text-black hover:opacity-90"
                        (click)="saveEdit(v.id)"
                      >
                        Save changes
                      </button>
                    </div>
                  </div>
                  <div class="rounded-lg border border-tf-border/80 border-l-2 border-l-tf-green/70 bg-tf-bg/50 p-4">
                      <p class="text-[11px] font-medium uppercase tracking-wide text-tf-muted">Identity</p>
                      <label class="mt-3 block text-xs font-medium text-neutral-300" for="edit-name-{{ v.id }}">Name</label>
                      <input
                        id="edit-name-{{ v.id }}"
                        [(ngModel)]="editForm.name"
                        (ngModelChange)="clearFieldError('edit', 'name')"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="e.g. BACKUP_FOLDER"
                        [attr.aria-invalid]="editFieldInvalid('name')"
                        [attr.aria-describedby]="editNameHintId(v.id)"
                        class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-1 focus:ring-tf-green"
                        [class.tf-var-field-invalid]="editFieldInvalid('name')"
                      />
                      <p [id]="editNameHintId(v.id)" class="mt-1 text-[11px] text-tf-muted">
                        Letters, numbers, underscore · start with a letter · max {{ nameMax }} chars
                      </p>
                      @if (editFormErrors()['name']) {
                        <p class="mt-1 text-xs text-red-300" role="alert">{{ editFormErrors()['name'] }}</p>
                      }
                      <label class="mt-4 block text-xs font-medium text-neutral-300" for="edit-desc-{{ v.id }}">
                        Description <span class="font-normal text-tf-muted">(optional)</span>
                      </label>
                      <textarea
                        id="edit-desc-{{ v.id }}"
                        [(ngModel)]="editForm.description"
                        rows="2"
                        [attr.maxlength]="descMax"
                        placeholder="What this variable is for — only you see this in the list."
                        class="mt-1 w-full resize-y rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-1 focus:ring-tf-green"
                      ></textarea>
                      <p class="mt-0.5 text-[11px] text-tf-muted">{{ editForm.description.length }}/{{ descMax }}</p>
                      @if (editFormErrors()['description']) {
                        <p class="mt-1 text-xs text-red-300" role="alert">{{ editFormErrors()['description'] }}</p>
                      }
                  </div>
                  <div class="rounded-lg border border-tf-border/80 border-l-2 border-l-sky-500/50 bg-tf-bg/50 p-4">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-tf-muted">Type &amp; value</p>
                    <label class="mt-3 block text-xs font-medium text-neutral-300" for="edit-type-{{ v.id }}">Type</label>
                    <select
                      id="edit-type-{{ v.id }}"
                      [(ngModel)]="editForm.type"
                      (ngModelChange)="onEditTypeChange($event)"
                      class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 text-sm text-neutral-100 focus:border-tf-green focus:outline-none focus:ring-1 focus:ring-tf-green"
                    >
                      <option value="string">Text (string)</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean (true/false)</option>
                      <option value="secret">Secret (stored as sensitive)</option>
                    </select>
                    <p class="mt-1 text-[11px] text-tf-muted">Controls validation and how the value is interpreted in workflows.</p>
                    @if (editForm.type === 'boolean') {
                      <label class="mt-4 block text-xs font-medium text-neutral-300" for="edit-bool-{{ v.id }}">Value</label>
                      <select
                        id="edit-bool-{{ v.id }}"
                        [(ngModel)]="editForm.value"
                        (ngModelChange)="clearFieldError('edit', 'value')"
                        class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 text-sm text-neutral-100 focus:border-tf-green focus:outline-none focus:ring-1 focus:ring-tf-green"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    } @else if (editForm.type === 'number') {
                      <label class="mt-4 block text-xs font-medium text-neutral-300" for="edit-num-{{ v.id }}">Value</label>
                      <input
                        id="edit-num-{{ v.id }}"
                        type="text"
                        inputmode="decimal"
                        [(ngModel)]="editForm.value"
                        (ngModelChange)="clearFieldError('edit', 'value')"
                        placeholder="e.g. 42 or 3.14"
                        [attr.aria-invalid]="editFieldInvalid('value')"
                        class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-1 focus:ring-tf-green"
                        [class.tf-var-field-invalid]="editFieldInvalid('value')"
                      />
                    } @else {
                      <label class="mt-4 block text-xs font-medium text-neutral-300" for="edit-val-{{ v.id }}">Value</label>
                      <textarea
                        id="edit-val-{{ v.id }}"
                        [(ngModel)]="editForm.value"
                        (ngModelChange)="clearFieldError('edit', 'value')"
                        rows="4"
                        [placeholder]="editForm.type === 'secret' ? 'Paste API key, token, or path…' : 'e.g. C:\\\\Backups or https://…'"
                        [attr.aria-invalid]="editFieldInvalid('value')"
                        class="mt-1 w-full resize-y rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-1 focus:ring-tf-green"
                        [class.tf-var-field-invalid]="editFieldInvalid('value')"
                      ></textarea>
                    }
                    @if (editFormErrors()['value']) {
                      <p class="mt-1 text-xs text-red-300" role="alert">{{ editFormErrors()['value'] }}</p>
                    }
                  </div>
                  <div class="rounded-lg border border-tf-border/80 border-l-2 border-l-amber-500/40 bg-tf-bg/50 p-4">
                    <p class="text-[11px] font-medium uppercase tracking-wide text-tf-muted">Privacy</p>
                    <label class="mt-3 flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        [(ngModel)]="editForm.is_secret"
                        [disabled]="editForm.type === 'secret'"
                        class="mt-1 rounded border-tf-border disabled:opacity-40"
                      />
                      <span>
                        <span class="text-sm font-medium text-neutral-200">Mask in UI &amp; logs</span>
                        <span class="mt-1 block text-xs text-tf-muted leading-relaxed">
                          When enabled, the value is hidden in this list and should be omitted from exports where possible. Type
                          “Secret” enables this automatically. Values still substitute in workflows at run time — they are not
                          encrypted at rest.
                        </span>
                      </span>
                    </label>
                  </div>
                </div>
              } @else {
                <div class="flex flex-wrap items-start gap-3">
                  <span class="text-2xl leading-none" aria-hidden="true">{{ typeIcon(v.type) }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="font-mono text-sm font-semibold text-neutral-100">{{ v.name }}</div>
                    @if (varDescription(v)) {
                      <p class="mt-1 text-xs text-tf-muted leading-relaxed">{{ varDescription(v) }}</p>
                    }
                    <div class="mt-2 flex flex-wrap gap-2">
                      <span class="rounded-md bg-neutral-800/90 px-2 py-0.5 text-[10px] font-medium text-neutral-300">{{
                        v.type
                      }}</span>
                      <span class="rounded-md bg-neutral-800/90 px-2 py-0.5 text-[10px] font-medium text-neutral-300">{{
                        v.scope
                      }}</span>
                      @if (v.is_secret || v.type === 'secret') {
                        <span class="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-200/90"
                          >Sensitive</span
                        >
                      }
                    </div>
                  </div>
                  <div
                    class="max-w-[min(100%,14rem)] break-all font-mono text-xs leading-relaxed text-neutral-400 sm:max-w-xs sm:text-sm"
                    [attr.title]="v.is_secret && !showSecrets ? '' : v.value"
                  >
                    @if (v.is_secret && !showSecrets) {
                      <span class="select-none tracking-widest text-neutral-500">••••••••</span>
                    } @else {
                      {{ v.value || '—' }}
                    }
                  </div>
                  <div class="flex shrink-0 gap-2">
                    <button
                      type="button"
                      class="rounded-lg border border-tf-border px-2.5 py-1.5 text-xs text-tf-green hover:bg-neutral-800"
                      (click)="startEdit(v)"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      class="rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
                      (click)="remove(v.id)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }
      @if (openAdd) {
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
          (click.self)="closeAddModal()"
          role="presentation"
        >
          <div
            class="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-tf-border bg-tf-card p-0 shadow-2xl shadow-black/40"
            (click)="$event.stopPropagation()"
            role="dialog"
            aria-modal="true"
            aria-labelledby="var-modal-title"
          >
            <div class="border-b border-tf-border px-6 py-4">
              <h2 id="var-modal-title" class="text-lg font-semibold text-neutral-50">New variable</h2>
              <p class="mt-1 text-sm text-tf-muted">
                Choose a valid name first — it must match how you type it inside
                <code class="rounded bg-neutral-800 px-1 font-mono text-[11px]">{{ '{' }}{{ '{' }}{{ '}' }}{{ '}' }}</code> in
                workflows.
              </p>
            </div>
            <div class="space-y-5 px-6 py-5">
              <div class="rounded-xl border border-tf-border/90 border-l-[3px] border-l-tf-green/80 bg-tf-bg/40 p-4">
                <p class="text-[11px] font-semibold uppercase tracking-wide text-tf-muted">Identity</p>
                <label class="mt-3 block text-xs font-medium text-neutral-300" for="add-var-name">Name</label>
                <input
                  id="add-var-name"
                  [(ngModel)]="form.name"
                  (ngModelChange)="clearFieldError('add', 'name')"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="e.g. SLACK_WEBHOOK_URL"
                  [attr.aria-invalid]="addFieldInvalid('name')"
                  aria-describedby="add-name-hint"
                  class="mt-1.5 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-2 focus:ring-tf-green/35"
                  [class.tf-var-field-invalid]="addFieldInvalid('name')"
                />
                <p id="add-name-hint" class="mt-1.5 text-[11px] leading-relaxed text-tf-muted">
                  Required · letters, numbers, underscore only · start with a letter · max {{ nameMax }} characters · no spaces
                </p>
                @if (addFormErrors()['name']) {
                  <p class="mt-2 text-sm text-red-300" role="alert">{{ addFormErrors()['name'] }}</p>
                }
                <label class="mt-4 block text-xs font-medium text-neutral-300" for="add-var-desc">
                  Description <span class="font-normal text-tf-muted">(optional)</span>
                </label>
                <textarea
                  id="add-var-desc"
                  [(ngModel)]="form.description"
                  rows="2"
                  [attr.maxlength]="descMax"
                  placeholder="Short note: what this is for, where it’s used…"
                  class="mt-1.5 w-full resize-y rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-2 focus:ring-tf-green/35"
                ></textarea>
                <p class="mt-0.5 text-[11px] text-tf-muted">{{ form.description.length }}/{{ descMax }}</p>
                @if (addFormErrors()['description']) {
                  <p class="mt-2 text-sm text-red-300" role="alert">{{ addFormErrors()['description'] }}</p>
                }
              </div>
              <div class="rounded-xl border border-tf-border/90 border-l-[3px] border-l-sky-500/60 bg-tf-bg/40 p-4">
                <p class="text-[11px] font-semibold uppercase tracking-wide text-tf-muted">Type &amp; value</p>
                <label class="mt-3 block text-xs font-medium text-neutral-300" for="add-var-type">Type</label>
                <select
                  id="add-var-type"
                  [(ngModel)]="form.type"
                  (ngModelChange)="onAddTypeChange($event)"
                  class="mt-1.5 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 text-sm text-neutral-100 focus:border-tf-green focus:outline-none focus:ring-2 focus:ring-tf-green/35"
                >
                  <option value="string">Text (string)</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean (true/false)</option>
                  <option value="secret">Secret (sensitive)</option>
                </select>
                @if (form.type === 'boolean') {
                  <label class="mt-4 block text-xs font-medium text-neutral-300" for="add-var-bool">Value</label>
                  <select
                    id="add-var-bool"
                    [(ngModel)]="form.value"
                    (ngModelChange)="clearFieldError('add', 'value')"
                    class="mt-1.5 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 text-sm text-neutral-100 focus:border-tf-green focus:outline-none focus:ring-2 focus:ring-tf-green/35"
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                } @else if (form.type === 'number') {
                  <label class="mt-4 block text-xs font-medium text-neutral-300" for="add-var-num">Value</label>
                  <input
                    id="add-var-num"
                    type="text"
                    inputmode="decimal"
                    [(ngModel)]="form.value"
                    (ngModelChange)="clearFieldError('add', 'value')"
                    placeholder="e.g. 10"
                    [attr.aria-invalid]="addFieldInvalid('value')"
                    class="mt-1.5 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-2 focus:ring-tf-green/35"
                    [class.tf-var-field-invalid]="addFieldInvalid('value')"
                  />
                } @else {
                  <label class="mt-4 block text-xs font-medium text-neutral-300" for="add-var-value">Value</label>
                  <textarea
                    id="add-var-value"
                    [(ngModel)]="form.value"
                    (ngModelChange)="clearFieldError('add', 'value')"
                    rows="4"
                    [placeholder]="form.type === 'secret' ? 'Paste token, password, or path…' : 'Default text or path'"
                    [attr.aria-invalid]="addFieldInvalid('value')"
                    class="mt-1.5 w-full resize-y rounded-lg border border-tf-border bg-tf-bg px-3 py-2.5 font-mono text-sm text-neutral-100 placeholder:text-neutral-600 focus:border-tf-green focus:outline-none focus:ring-2 focus:ring-tf-green/35"
                    [class.tf-var-field-invalid]="addFieldInvalid('value')"
                  ></textarea>
                }
                @if (addFormErrors()['value']) {
                  <p class="mt-2 text-sm text-red-300" role="alert">{{ addFormErrors()['value'] }}</p>
                }
              </div>
              <div class="rounded-xl border border-tf-border/90 border-l-[3px] border-l-amber-500/50 bg-tf-bg/40 p-4">
                <p class="text-[11px] font-semibold uppercase tracking-wide text-tf-muted">Privacy</p>
                <label class="mt-3 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    [(ngModel)]="form.is_secret"
                    [disabled]="form.type === 'secret'"
                    class="mt-1 rounded border-tf-border disabled:opacity-40"
                  />
                  <span>
                    <span class="text-sm font-medium text-neutral-200">Mask in UI &amp; hide when “Show secret values” is off</span>
                    <span class="mt-1 block text-xs text-tf-muted leading-relaxed">
                      Does not encrypt the database file. Use for tokens you do not want shown on screen. “Secret” type checks
                      this automatically.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <div class="flex flex-wrap justify-end gap-2 border-t border-tf-border bg-tf-bg/30 px-6 py-4">
              <button
                type="button"
                class="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
                (click)="closeAddModal()"
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-tf-green px-5 py-2 text-sm font-medium text-black hover:opacity-90"
                (click)="add()"
              >
                Save variable
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class VariablesPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  protected readonly nameMax = NAME_MAX;
  protected readonly descMax = DESC_MAX;

  protected readonly list = signal<VarRow[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected showSecrets = false;
  protected openAdd = false;
  protected form: VariableFormModel = { name: '', type: 'string', value: '', is_secret: false, description: '' };
  protected editForm: VariableFormModel = { name: '', type: 'string', value: '', is_secret: false, description: '' };

  private readonly addErrors = signal<Record<string, string>>({});
  private readonly editErrors = signal<Record<string, string>>({});

  protected addFormErrors(): Record<string, string> {
    return this.addErrors();
  }
  protected editFormErrors(): Record<string, string> {
    return this.editErrors();
  }

  protected editNameHintId(id: string): string {
    return `edit-name-hint-${id}`;
  }

  protected varDescription(v: VarRow): string {
    const d = v.description;
    return typeof d === 'string' && d.trim() ? d.trim() : '';
  }

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    const rows = (await this.ipc.api.variables.list()) as VarRow[];
    this.list.set(rows);
  }

  protected typeIcon(t: string): string {
    const m: Record<string, string> = { string: '📝', number: '#', boolean: '◆', secret: '🔒' };
    return m[t] ?? '📝';
  }

  protected openAddModal(): void {
    this.form = { name: '', type: 'string', value: '', is_secret: false, description: '' };
    this.addErrors.set({});
    this.openAdd = true;
  }

  protected closeAddModal(): void {
    this.openAdd = false;
    this.addErrors.set({});
  }

  protected onAddTypeChange(t: string): void {
    if (t === 'secret') this.form.is_secret = true;
    if (t === 'boolean' && !['true', 'false'].includes(this.form.value.trim())) this.form.value = 'false';
    if (t === 'number' && this.form.value === 'true') this.form.value = '';
  }

  protected onEditTypeChange(t: string): void {
    if (t === 'secret') this.editForm.is_secret = true;
    if (t === 'boolean') {
      const v = this.editForm.value.trim().toLowerCase();
      this.editForm.value = ['true', '1', 'yes'].includes(v) ? 'true' : 'false';
    }
  }

  protected clearFieldError(which: 'add' | 'edit', field: string): void {
    const sig = which === 'add' ? this.addErrors : this.editErrors;
    const cur = { ...sig() };
    delete cur[field];
    sig.set(cur);
  }

  protected addFieldInvalid(field: string): boolean {
    return Boolean(this.addErrors()[field]);
  }

  protected editFieldInvalid(field: string): boolean {
    return Boolean(this.editErrors()[field]);
  }

  startEdit(v: VarRow): void {
    this.editErrors.set({});
    this.editingId.set(v.id);
    const boolVal =
      ['true', '1', 'yes'].includes(String(v.value).trim().toLowerCase()) || String(v.value).trim() === 'true'
        ? 'true'
        : 'false';
    this.editForm = {
      name: v.name,
      type: v.type,
      value: v.type === 'boolean' ? boolVal : v.value,
      is_secret: !!v.is_secret || v.type === 'secret',
      description: typeof v.description === 'string' ? v.description : '',
    };
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.editErrors.set({});
  }

  private validate(
    model: VariableFormModel,
    opts: { excludeId?: string }
  ): Record<string, string> {
    const err: Record<string, string> = {};
    const name = model.name.trim();
    if (!name) err['name'] = 'Enter a variable name.';
    else if (name.length > NAME_MAX) err['name'] = `Name must be at most ${NAME_MAX} characters.`;
    else if (!NAME_PATTERN.test(name)) {
      err['name'] =
        'Use only letters, numbers, and underscores, and start with a letter (e.g. MY_API_KEY). No spaces.';
    } else if (this.isNameTaken(name, opts.excludeId)) {
      err['name'] = 'That name is already used. Choose another.';
    }

    if (model.description.length > DESC_MAX) {
      err['description'] = `Description must be at most ${DESC_MAX} characters.`;
    }

    const t = model.type;
    const raw = model.value.trim();
    if (t === 'number') {
      if (raw === '') err['value'] = 'Enter a number (or use type “Text” for empty).';
      else if (Number.isNaN(Number(raw))) err['value'] = 'This is not a valid number.';
    }
    if (t === 'boolean' && !['true', 'false'].includes(model.value.trim())) {
      err['value'] = 'Choose true or false.';
    }
    return err;
  }

  private isNameTaken(name: string, exceptId?: string): boolean {
    const n = name.trim();
    return this.list().some((v) => v.name === n && v.id !== exceptId);
  }

  private normalizeValue(type: string, value: string): string {
    if (type === 'boolean') {
      const v = value.trim().toLowerCase();
      return ['1', 'true', 'yes'].includes(v) ? 'true' : 'false';
    }
    return value;
  }

  async saveEdit(id: string): Promise<void> {
    const errors = this.validate(this.editForm, { excludeId: id });
    if (Object.keys(errors).length) {
      this.editErrors.set(errors);
      this.toast.warning('Fix the highlighted fields before saving.');
      return;
    }
    const isSecret = this.editForm.is_secret || this.editForm.type === 'secret';
    try {
      await this.ipc.api.variables.update({
        id,
        name: this.editForm.name.trim(),
        type: this.editForm.type,
        value: this.normalizeValue(this.editForm.type, this.editForm.value),
        is_secret: isSecret,
        description: this.editForm.description.trim(),
      });
    } catch (e) {
      this.handleSaveError(e, 'edit');
      return;
    }
    this.editingId.set(null);
    this.editErrors.set({});
    await this.reload();
    this.toast.success('Variable updated');
  }

  async add(): Promise<void> {
    const errors = this.validate(this.form, {});
    if (Object.keys(errors).length) {
      this.addErrors.set(errors);
      this.toast.warning('Fix the highlighted fields before saving.');
      return;
    }
    const isSecret = this.form.is_secret || this.form.type === 'secret';
    try {
      await this.ipc.api.variables.create({
        name: this.form.name.trim(),
        type: this.form.type,
        value: this.normalizeValue(this.form.type, this.form.value),
        is_secret: isSecret,
        description: this.form.description.trim(),
      });
    } catch (e) {
      this.handleSaveError(e, 'add');
      return;
    }
    this.closeAddModal();
    await this.reload();
    this.toast.success('Variable created');
  }

  private handleSaveError(e: unknown, which: 'add' | 'edit'): void {
    const msg = e instanceof Error ? e.message : String(e);
    const lower = msg.toLowerCase();
    if (lower.includes('unique') || lower.includes('constraint') || lower.includes('sql')) {
      const sig = which === 'add' ? this.addErrors : this.editErrors;
      sig.set({ ...sig(), name: 'That name is already taken. Choose a different name.' });
      this.toast.error('Could not save — duplicate name.');
      return;
    }
    this.toast.error('Could not save variable.');
  }

  async remove(id: string): Promise<void> {
    const ok = await this.confirmDialog.confirm({
      title: 'Delete variable',
      message: 'Remove this variable? Workflows that reference it may fail until you update them.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await this.ipc.api.variables.delete(id);
    if (this.editingId() === id) this.editingId.set(null);
    await this.reload();
    this.toast.info('Variable deleted');
  }
}
