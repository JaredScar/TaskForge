import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-onboarding-page',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-2xl">
      <div class="flex flex-col items-center text-center sm:items-start sm:text-left">
        <img
          src="taskforge.png"
          width="96"
          height="96"
          alt="TaskForge"
          class="mb-4 h-24 w-24 rounded-2xl object-contain shadow-lg shadow-black/30"
        />
        <h1 class="text-2xl font-semibold tracking-tight">Welcome to TaskForge</h1>
      </div>
      <p class="mt-2 text-sm text-tf-muted">
        A modern replacement for Windows Task Scheduler — build automations with triggers, conditions, and actions.
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2">
        <button
          type="button"
          (click)="goMarketplace()"
          class="rounded-xl border border-tf-border bg-tf-card p-6 text-left transition hover:border-tf-green/40"
        >
          <span class="text-2xl">📦</span>
          <h2 class="mt-3 font-medium">Start from a template</h2>
          <p class="mt-1 text-xs text-tf-muted">Install a prebuilt workflow from the marketplace.</p>
        </button>
        <button
          type="button"
          (click)="goBuilder()"
          class="rounded-xl border border-tf-border bg-tf-card p-6 text-left transition hover:border-tf-green/40"
        >
          <span class="text-2xl">✏️</span>
          <h2 class="mt-3 font-medium">Build from scratch</h2>
          <p class="mt-1 text-xs text-tf-muted">Open the builder and define your first automation.</p>
        </button>
      </div>
      <p class="mt-8 text-center text-sm text-tf-muted">
        <button type="button" (click)="skip()" class="text-tf-green hover:underline">Skip for now</button>
      </p>
    </div>
  `,
})
export class OnboardingPageComponent {
  private readonly router = inject(Router);

  private dismiss(): void {
    try {
      localStorage.setItem('taskforge_onboarding_done', '1');
    } catch {
      /* ignore */
    }
  }

  skip(): void {
    this.dismiss();
    void this.router.navigate(['/workflows']);
  }

  goMarketplace(): void {
    this.dismiss();
    void this.router.navigate(['/marketplace']);
  }

  goBuilder(): void {
    this.dismiss();
    void this.router.navigate(['/builder', 'new']);
  }
}
