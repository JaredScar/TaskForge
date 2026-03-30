import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule],
  template: `
    <div class="max-w-lg space-y-8">
      <div>
        <h1 class="text-xl font-semibold">Settings</h1>
        <p class="mt-1 text-sm text-tf-muted">Application preferences (stored locally)</p>
      </div>
      @if (showUnlockBanner()) {
        <div class="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100">
          Add a valid <strong class="font-medium text-amber-50">organization license key</strong> below to unlock AI Assistant,
          Variables, Marketplace, Analytics, Team, API Access, and Audit Logs (open-core model — see PLAN.md §20).
        </div>
      }
      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">Organization license key</h2>
        <p class="mt-1 text-xs text-tf-muted">
          Product entitlement (not your REST <code class="text-[11px] text-neutral-500">api_key</code>). Official builds can require online validation
          (<code class="text-[11px] text-neutral-500">TASKFORGE_LICENSE_API_URL</code> + <code class="text-[11px] text-neutral-500">hybrid</code> /
          <code class="text-[11px] text-neutral-500">online_strict</code>). Dev: signed
          <code class="text-[11px] text-neutral-500">tfent1…</code> via <code class="text-[11px] text-neutral-500">node scripts/generate-entitlement-key.mjs</code> or
          <code class="text-[11px] text-neutral-500">local-dev-pro-enterprise</code>.
        </p>
        @if (licenseServerConfigured()) {
          <p class="mt-2 text-xs text-neutral-400">
            License mode: <span class="text-neutral-200">{{ licenseMode() }}</span> · server URL configured (§20.9).
          </p>
        }
        <input
          type="password"
          [(ngModel)]="entitlementKey"
          autocomplete="off"
          class="mt-3 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm font-mono"
          placeholder="Paste organization license key…"
        />
        <div class="mt-3 flex flex-wrap gap-2">
          <button type="button" (click)="saveEntitlement()" class="rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black">
            Save license
          </button>
          <button
            type="button"
            (click)="clearEntitlement()"
            class="rounded-lg border border-tf-border px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Clear
          </button>
          @if (licenseServerConfigured()) {
            <button
              type="button"
              (click)="refreshLicenseOnline()"
              class="rounded-lg border border-tf-border px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
            >
              Check license server
            </button>
          }
        </div>
        @if (entitlementStatus() === 'ok') {
          <p class="mt-2 text-xs text-tf-green">License accepted — Pro and Enterprise features are unlocked.</p>
        }
        @if (entitlementStatus() === 'invalid') {
          <p class="mt-2 text-xs text-red-300">That key is not valid for this build (check secret / format / server).</p>
        }
        @if (entitlementStatus() === 'network') {
          <p class="mt-2 text-xs text-amber-200">Could not reach the license server. Try again or check your network.</p>
        }
      </div>
      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">OpenAI API Key</h2>
        <p class="mt-1 text-xs text-tf-muted">Optional. Stored locally for AI Workflow Assistant.</p>
        @if (!ipc.isElectron) {
          <p class="mt-2 text-xs text-amber-200/90">
            Browser preview (<code class="text-[11px]">ng serve</code>): the field is pre-filled with a
            <strong>non-functional</strong> placeholder. It is not sent to OpenAI. Use Electron for real keys.
          </p>
        }
        <input
          type="password"
          [(ngModel)]="openaiKey"
          class="mt-3 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
          placeholder="sk-..."
        />
        <button type="button" (click)="saveKey()" class="mt-3 rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black">
          Save key
        </button>
        @if (savedKey()) {
          <p class="mt-2 text-xs text-tf-green">Saved.</p>
        }
      </div>
      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">Automation &amp; logs</h2>
        <p class="mt-1 text-xs text-tf-muted">Engine and retention preferences (read by the app on next releases).</p>
        <label class="mt-4 block text-xs text-tf-muted">Log retention (days)</label>
        <input
          type="number"
          min="1"
          max="3650"
          [(ngModel)]="logRetentionDays"
          class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
        />
        <label class="mt-4 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="engineAutoStart" />
          Prefer engine auto-start on launch
        </label>
        <label class="mt-3 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="notifyDesktop" />
          Desktop notifications for workflow events
        </label>
        <button type="button" (click)="savePrefs()" class="mt-4 rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black">
          Save preferences
        </button>
        @if (savedPrefs()) {
          <p class="mt-2 text-xs text-tf-green">Preferences saved.</p>
        }
      </div>
    </div>
  `,
})
export class SettingsPageComponent implements OnInit {
  protected readonly ipc = inject(IpcService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);

  protected openaiKey = '';
  protected entitlementKey = '';
  protected logRetentionDays = 30;
  protected engineAutoStart = true;
  protected notifyDesktop = true;
  protected readonly savedKey = signal(false);
  protected readonly savedPrefs = signal(false);
  protected readonly showUnlockBanner = signal(false);
  /** unset | ok | invalid | network — feedback after save attempt */
  protected readonly entitlementStatus = signal<'unset' | 'ok' | 'invalid' | 'network'>('unset');
  protected readonly licenseServerConfigured = signal(false);
  protected readonly licenseMode = signal('local');

  async ngOnInit(): Promise<void> {
    this.showUnlockBanner.set(this.route.snapshot.queryParamMap.get('unlock') === '1');
    const ek = await this.ipc.api.settings.get('pro_entitlement_key');
    this.entitlementKey = ek ?? '';
    const st = await this.ipc.api.entitlement.getStatus();
    this.licenseServerConfigured.set(!!st.licenseServerConfigured);
    this.licenseMode.set(st.licenseMode ?? 'local');
    if (st.unlocked) this.entitlementStatus.set('ok');

    const v = await this.ipc.api.settings.get('openai_api_key');
    this.openaiKey = v ?? '';
    const lr = await this.ipc.api.settings.get('log_retention_days');
    if (lr != null && lr !== '') this.logRetentionDays = Math.max(1, parseInt(lr, 10) || 30);
    const ea = await this.ipc.api.settings.get('engine_auto_start');
    if (ea != null) this.engineAutoStart = ea === '1' || ea === 'true';
    const nd = await this.ipc.api.settings.get('notify_desktop');
    if (nd != null) this.notifyDesktop = nd === '1' || nd === 'true';
  }

  async saveEntitlement(): Promise<void> {
    this.entitlementStatus.set('unset');
    const res = await this.ipc.api.entitlement.setKey(this.entitlementKey);
    if (res.ok) {
      this.entitlementStatus.set(res.unlocked ? 'ok' : 'unset');
      this.toast.success(res.unlocked ? 'License saved' : 'License cleared');
      this.showUnlockBanner.set(false);
      return;
    }
    if (res.error === 'invalid_key') {
      this.entitlementStatus.set('invalid');
      this.toast.error('Invalid license key');
    }
    if (res.error === 'network') {
      this.entitlementStatus.set('network');
      this.toast.warning('License server unreachable — key was not saved');
    }
  }

  async refreshLicenseOnline(): Promise<void> {
    const r = await this.ipc.api.entitlement.refreshOnline();
    if (r.ok && r.unlocked) {
      this.entitlementStatus.set('ok');
      this.toast.success('License verified');
    } else {
      this.toast.error(r.error ? `Check failed: ${r.error}` : 'License check failed');
    }
  }

  async clearEntitlement(): Promise<void> {
    this.entitlementKey = '';
    await this.saveEntitlement();
  }

  async saveKey(): Promise<void> {
    await this.ipc.api.settings.set('openai_api_key', this.openaiKey);
    this.savedKey.set(true);
    this.toast.success('API key saved');
    setTimeout(() => this.savedKey.set(false), 2000);
  }

  async savePrefs(): Promise<void> {
    await this.ipc.api.settings.set('log_retention_days', String(this.logRetentionDays));
    await this.ipc.api.settings.set('engine_auto_start', this.engineAutoStart ? '1' : '0');
    await this.ipc.api.settings.set('notify_desktop', this.notifyDesktop ? '1' : '0');
    this.savedPrefs.set(true);
    this.toast.success('Preferences saved');
    setTimeout(() => this.savedPrefs.set(false), 2000);
  }
}
