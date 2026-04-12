import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { EmptyStateComponent } from '../../shared/ui/empty-state/empty-state.component';

type MarketplaceItem = {
  id: string;
  title: string;
  author: string;
  description: string;
  pro: boolean;
  installedCount: number;
};

@Component({
  selector: 'app-marketplace-page',
  imports: [FormsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">Workflow templates</h1>
          <p class="mt-1 text-sm text-tf-muted">Built-in starters you can install and customize in the builder</p>
        </div>
        <input
          type="search"
          [ngModel]="q()"
          (ngModelChange)="q.set($event)"
          placeholder="Search templates…"
          class="h-9 w-56 rounded-lg border border-tf-border bg-tf-card px-3 text-sm"
        />
      </div>
      @if (items().length === 0) {
        <app-empty-state
          class="mt-8 block"
          icon="📦"
          title="No templates"
          description="Could not load the template catalog. Check your connection or TASKFORGE_MARKETPLACE_URL."
        />
      } @else if (filtered().length === 0) {
        <app-empty-state
          class="mt-8 block"
          icon="🔍"
          title="No matching templates"
          description="Try a different search term or clear the filter."
        />
      }
      <div class="mt-6 grid gap-4 md:grid-cols-2" [class.hidden]="items().length === 0 || filtered().length === 0">
        @for (item of filtered(); track item.id) {
          <div class="rounded-xl border border-tf-border bg-tf-card p-5">
            <div class="flex items-start justify-between gap-2">
              <span class="text-3xl">📦</span>
              <div class="flex flex-wrap justify-end gap-1">
                @if (item.installedCount > 0) {
                  <span class="rounded bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-200">Installed ×{{ item.installedCount }}</span>
                }
                @if (item.pro) {
                  <span class="rounded bg-tf-green/20 px-2 py-0.5 text-[10px] text-tf-green">Pro</span>
                }
              </div>
            </div>
            <h2 class="mt-3 font-semibold">{{ item.title }}</h2>
            <p class="text-xs text-tf-muted">{{ item.author }}</p>
            <p class="mt-2 text-sm text-neutral-400">{{ item.description }}</p>
            <p class="mt-3 text-xs text-tf-muted">Included with TaskForge — not a remote download</p>
            <button
              type="button"
              (click)="install(item.id)"
              class="mt-4 w-full rounded-lg border border-tf-border py-2 text-sm hover:bg-neutral-800"
            >
              Install template
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class MarketplacePageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  protected readonly items = signal<MarketplaceItem[]>([]);
  protected readonly q = signal('');

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.items.set(await this.ipc.api.marketplace.list());
  }

  protected filtered(): MarketplaceItem[] {
    const s = this.q().toLowerCase();
    return this.items().filter((i) => !s || i.title.toLowerCase().includes(s) || i.description.toLowerCase().includes(s));
  }

  async install(id: string): Promise<void> {
    const item = this.items().find((i) => i.id === id);
    if (item && item.installedCount > 0) {
      const ok = await this.confirmDialog.confirm({
        title: 'Install again?',
        message: 'This creates another workflow copy from the same template.',
        confirmLabel: 'Install copy',
      });
      if (!ok) return;
    }
    const newId = await this.ipc.api.marketplace.install(id);
    if (newId) {
      this.toast.success('Template installed — opening builder');
      await this.reload();
      void this.router.navigate(['/builder', newId]);
    } else {
      this.toast.warning('Install needs the TaskForge desktop app (Electron).');
    }
  }
}
