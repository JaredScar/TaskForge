import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgClass } from '@angular/common';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { HotkeysService } from '../../core/services/hotkeys.service';
import type { ToastLevel } from '../../core/services/toast.service';
import { LEGACY_ONBOARDING_DONE_STORAGE_KEY } from '../../core/legacy-onboarding-key';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgClass],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private readonly ipc = inject(IpcService);
  private readonly router = inject(Router);
  protected readonly toast = inject(ToastService);
  protected readonly confirmDialog = inject(ConfirmDialogService);
  private readonly hotkeys = inject(HotkeysService);

  protected readonly wfCount = signal(0);
  protected readonly proUnlocked = signal(false);
  protected readonly selfMember = signal<{ display_name: string; role: string } | null>(null);
  protected readonly stats = signal({
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

  async ngOnInit(): Promise<void> {
    this.migrateLegacyOnboardingKey();
    await this.refreshCounts();
    await this.maybeOnboarding();
    this.timer = setInterval(() => void this.refreshCounts(), 5000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  @HostListener('document:keydown', ['$event'])
  protected onGlobalKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.confirmDialog.active()) {
      this.confirmDialog.respond(false);
      e.preventDefault();
      return;
    }
    const path = this.router.url.split('?')[0];
    const meta = e.ctrlKey || e.metaKey;
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
    } catch {
      /* ignore */
    }
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
    } catch {
      /* ignore */
    }
  }
}
