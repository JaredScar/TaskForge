import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgClass } from '@angular/common';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { LoadingService } from '../../core/services/loading.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { HotkeysService } from '../../core/services/hotkeys.service';
import type { ToastLevel } from '../../core/services/toast.service';
import { LEGACY_ONBOARDING_DONE_STORAGE_KEY } from '../../core/legacy-onboarding-key';
import type { AppStats } from '../../../types/ipc-channels';
import { FORGETASK_UPGRADE_URL } from '../../core/constants/product-urls';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgClass],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly toast = inject(ToastService);
  protected readonly confirmDialog = inject(ConfirmDialogService);
  protected readonly loading = inject(LoadingService);
  private readonly hotkeys = inject(HotkeysService);

  protected readonly wfCount = signal(0);
  protected readonly proUnlocked = signal(false);
  protected readonly selfMember = signal<{ display_name: string; role: string } | null>(null);
  protected readonly isViewerRole = signal(false);
  protected readonly showHotkeysLegend = signal(false);
  protected readonly toastPosition = signal<'top' | 'bottom'>('bottom');
  protected readonly stats = signal<AppStats>({
    active: 0,
    queue: 0,
    triggerCount: 0,
    actionCount: 0,
    engineRunning: false,
    cpu: 0,
    memoryMb: 48,
    version: '2.1.0',
  });
  private timer: ReturnType<typeof setInterval> | null = null;

  /** External marketing URL for sidebar upgrade card (see `product-urls.ts`). */
  protected readonly upgradeUrl = FORGETASK_UPGRADE_URL;

  async ngOnInit(): Promise<void> {
    this.migrateLegacyOnboardingKey();
    if (this.ipc.isElectron) {
      try {
        const tp = await this.ipc.api.settings.get('toast_position');
        if (tp === 'top' || tp === 'bottom') this.toastPosition.set(tp);
      } catch {
        /* ignore — non-critical UI preference; defaults are acceptable */
      }
    }
    await this.refreshCounts();
    await this.maybeOnboarding();
    this.timer = setInterval(() => void this.refreshCounts(), 5000);
    this.destroyRef.onDestroy(() => {
      if (this.timer) clearInterval(this.timer);
    });
  }

  @HostListener('document:keydown', ['$event'])
  protected onGlobalKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.showHotkeysLegend()) {
        this.showHotkeysLegend.set(false);
        e.preventDefault();
        return;
      }
      if (this.confirmDialog.active()) {
        this.confirmDialog.respond(false);
        e.preventDefault();
        return;
      }
    }
    const meta = e.ctrlKey || e.metaKey;
    if (e.key === '?' && !meta) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(e.target as HTMLElement | null)?.isContentEditable) {
        e.preventDefault();
        this.showHotkeysLegend.update((v) => !v);
        return;
      }
    }
    const path = this.router.url.split('?')[0];
    if (meta && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      document.querySelector<HTMLElement>('[data-tf-focus-search]')?.focus();
      return;
    }
    if (path.startsWith('/builder/') && meta && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      this.hotkeys.saveBuilder$.next();
      return;
    }
    if (path.startsWith('/builder/') && meta && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      this.hotkeys.testRunBuilder$.next();
      return;
    }
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName ?? '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return;
    if (meta && (e.key === 'n' || e.key === 'N')) {
      e.preventDefault();
      void this.quickNewWorkflow();
    }
  }

  private async quickNewWorkflow(): Promise<void> {
    if (this.isViewerRole()) {
      this.toast.warning('Viewers cannot create workflows.');
      return;
    }
    try {
      const id = await this.ipc.api.workflows.create({ name: 'Untitled workflow', description: '' });
      await this.router.navigate(['/builder', id]);
    } catch {
      this.toast.error('Could not create workflow');
    }
  }

  private migrateLegacyOnboardingKey(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const v = localStorage.getItem(LEGACY_ONBOARDING_DONE_STORAGE_KEY);
      if (v != null) {
        localStorage.setItem('taskforge_onboarding_done', v);
        localStorage.removeItem(LEGACY_ONBOARDING_DONE_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  private async maybeOnboarding(): Promise<void> {
    try {
      const path = this.router.url.split('?')[0];
      if (path !== '/' && path !== '/workflows') return;
      const list = await this.ipc.api.workflows.list();
      if (list.length > 0) return;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('taskforge_onboarding_done')) return;
      await this.router.navigate(['/onboarding']);
    } catch (e) {
      console.warn('[app-shell] refreshCounts failed', e);
    }
  }

  protected toastStackClass(): string {
    return this.toastPosition() === 'top' ? 'top-16' : 'bottom-6';
  }

  protected toastBoxClass(level: ToastLevel): Record<string, boolean> {
    const base = {
      'pointer-events-auto flex items-start justify-between gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg': true,
    };
    if (level === 'success') {
      return { ...base, 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200': true };
    }
    if (level === 'error') {
      return { ...base, 'border-red-500/40 bg-red-500/10 text-red-200': true };
    }
    if (level === 'warning') {
      return { ...base, 'border-amber-500/40 bg-amber-500/10 text-amber-100': true };
    }
    return { ...base, 'border-tf-border bg-tf-card text-neutral-200': true };
  }

  private async refreshCounts(): Promise<void> {
    try {
      const list = await this.ipc.api.workflows.list();
      this.wfCount.set(list.length);
      const s = await this.ipc.api.app.getStats();
      this.stats.set(s);
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      this.proUnlocked.set(unlocked);
      const team = (await this.ipc.api.team.list()) as Array<{
        display_name: string;
        role: string;
        is_self: number;
      }>;
      const self = team.find((m) => m.is_self === 1);
      this.selfMember.set(unlocked && self ? { display_name: self.display_name, role: self.role } : null);
      this.isViewerRole.set(Boolean(unlocked && self?.role === 'Viewer'));
      if (this.ipc.isElectron) {
        const tp = await this.ipc.api.settings.get('toast_position');
        if (tp === 'top' || tp === 'bottom') this.toastPosition.set(tp);
      }
    } catch {
      /* ignore */
    }
  }
}
