import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmDialogService } from '../../core/services/confirm-dialog.service';
import { LoadingService } from '../../core/services/loading.service';

@Component({
  selector: 'app-settings-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-lg space-y-8">
      <div>
        <h1 class="text-xl font-semibold">Settings</h1>
        <p class="mt-1 text-sm text-tf-muted">Application preferences (stored locally)</p>
      </div>
      @if (isViewer()) {
        <div class="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
            <path d="M8 2l6 12H2Z"/><path d="M8 7v3"/><circle cx="8" cy="12" r="0.5" fill="currentColor"/>
          </svg>
          You have <strong class="font-semibold">Viewer</strong> access — settings are read-only.
        </div>
      }
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
          <button type="button" (click)="saveEntitlement()" [disabled]="isViewer()" class="rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
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
        @if (licenseLastVerifiedAt()) {
          <p class="mt-2 text-xs text-tf-muted">
            Last verified with license service: <span class="text-neutral-300">{{ licenseLastVerifiedAt() }}</span>
          </p>
        }
        @if (licenseValidUntilDisplay()) {
          <p class="mt-1 text-xs text-tf-muted">
            Cached valid-until (online checks): <span class="text-neutral-300">{{ licenseValidUntilDisplay() }}</span>
          </p>
        }
        @if (licenseSeats() != null) {
          <p class="mt-1 text-xs text-tf-muted">Seats in key payload: {{ licenseSeats() }}</p>
        }
      </div>
      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">AI Workflow Assistant</h2>
        <p class="mt-1 text-xs text-tf-muted">
          Pro/Enterprise only. Choose cloud OpenAI or a local gateway (see <code class="text-[11px] text-neutral-500">local-ai-gateway/</code>).
        </p>
        @if (!ipc.isElectron) {
          <p class="mt-2 text-xs text-amber-200/90">
            Browser preview (<code class="text-[11px]">ng serve</code>): OpenAI field uses a
            <strong>non-functional</strong> placeholder. Use Electron for real requests.
          </p>
        }
        <label class="mt-4 block text-xs text-tf-muted">Backend</label>
        <select
          [(ngModel)]="aiProvider"
          class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-200"
        >
          <option value="openai">OpenAI (cloud)</option>
          <option value="local">Local gateway (Ollama via TaskForge gateway)</option>
        </select>
        @if (aiProvider === 'openai') {
          <label class="mt-4 block text-xs text-tf-muted">OpenAI API key</label>
          <input
            type="password"
            [(ngModel)]="openaiKey"
            class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
            placeholder="sk-..."
            autocomplete="off"
          />
        }
        @if (aiProvider === 'local') {
          <p class="mt-3 text-xs text-tf-muted">
            Start <strong class="text-neutral-400">Ollama</strong>, then run <code class="text-[11px] text-neutral-500">npm start</code> in
            <code class="text-[11px] text-neutral-500">local-ai-gateway/</code> (default <code class="text-[11px] text-neutral-500">127.0.0.1:11435</code>).
          </p>
          <label class="mt-3 block text-xs text-tf-muted">Gateway base URL</label>
          <input
            type="url"
            [(ngModel)]="localAiBaseUrl"
            class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm font-mono text-neutral-200"
            placeholder="http://127.0.0.1:11435"
            autocomplete="off"
          />
          <label class="mt-3 block text-xs text-tf-muted">Model name</label>
          <input
            type="text"
            [(ngModel)]="localAiModel"
            class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm font-mono text-neutral-200"
            placeholder="llama3.2"
            autocomplete="off"
          />
          <label class="mt-3 block text-xs text-tf-muted">Gateway token (optional)</label>
          <p class="mt-1 text-[11px] text-tf-muted">
            Only if <code class="text-neutral-500">TASKFORGE_GATEWAY_TOKEN</code> is set when starting the gateway.
          </p>
          <input
            type="password"
            [(ngModel)]="localAiGatewayToken"
            class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
            placeholder="Leave empty if gateway has no token"
            autocomplete="off"
          />
        }
        <button type="button" (click)="saveAiSettings()" [disabled]="isViewer()" class="mt-4 rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          Save AI settings
        </button>
        @if (savedAiSettings()) {
          <p class="mt-2 text-xs text-tf-green">Saved.</p>
        }
      </div>
      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">Automation &amp; logs</h2>
        <p class="mt-1 text-xs text-tf-muted">Engine, retention, and trigger catch-up (stored locally; some features apply after restart).</p>
        <label class="mt-4 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="logRetentionForever" />
          Keep logs forever (no automatic purge by age — future engine use)
        </label>
        <label class="mt-4 block text-xs text-tf-muted">Log retention (days)</label>
        <input
          type="number"
          min="1"
          max="3650"
          [(ngModel)]="logRetentionDays"
          [disabled]="logRetentionForever"
          class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm disabled:opacity-50"
        />
        <label class="mt-4 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="clearLogsOnStartup" />
          Clear all execution logs on next app launch
        </label>
        <label class="mt-3 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="replayMissedCron" />
          Replay missed cron runs after restart (one catch-up per schedule)
        </label>
        <label class="mt-4 block text-xs text-tf-muted">Default priority for new workflows</label>
        <select [(ngModel)]="defaultWorkflowPriority" class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-200">
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="low">Low</option>
        </select>
        <label class="mt-4 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="engineAutoStart" />
          Prefer engine auto-start on launch
        </label>
        <label class="mt-3 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="notifyDesktop" />
          Desktop notifications for workflow events
        </label>
        <label class="mt-3 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="soundOnWorkflowFailure" />
          System beep when a workflow run fails
        </label>
        <label class="mt-4 block text-xs text-tf-muted">Max concurrent workflow runs (stored for future engine use)</label>
        <input
          type="number"
          min="1"
          max="50"
          [(ngModel)]="maxConcurrentWorkflows"
          class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm"
        />
        <label class="mt-4 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="confirmDeleteWorkflow" />
          Confirm before deleting workflows
        </label>
        <button type="button" (click)="savePrefs()" [disabled]="isViewer()" class="mt-4 rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          Save preferences
        </button>
        @if (savedPrefs()) {
          <p class="mt-2 text-xs text-tf-green">Preferences saved.</p>
        }
      </div>

      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">UI &amp; appearance</h2>
        <p class="mt-1 text-xs text-tf-muted">Language, theme, accent, toasts, and Builder defaults (applied after save / reload where noted).</p>
        <label class="mt-4 block text-xs text-tf-muted">Language (HTML lang)</label>
        <select [(ngModel)]="uiLocale" class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-200">
          <option value="en">English</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
        </select>
        <label class="mt-4 block text-xs text-tf-muted">Theme</label>
        <select [(ngModel)]="uiTheme" class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-200">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
        <label class="mt-4 block text-xs text-tf-muted">Accent</label>
        <select [(ngModel)]="uiAccent" class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-200">
          <option value="green">Green</option>
          <option value="blue">Blue</option>
          <option value="amber">Amber</option>
          <option value="violet">Violet</option>
        </select>
        <label class="mt-4 block text-xs text-tf-muted">Toast stack position</label>
        <select [(ngModel)]="toastPosition" class="mt-1 w-full rounded-lg border border-tf-border bg-tf-bg px-3 py-2 text-sm text-neutral-200">
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
        <label class="mt-4 flex items-center gap-2 text-sm text-neutral-200">
          <input type="checkbox" [(ngModel)]="builderShowJsonDefault" />
          Builder: open “Show JSON” by default for node config
        </label>
        <button type="button" (click)="savePrefs()" [disabled]="isViewer()" class="mt-4 rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black disabled:opacity-50">
          Save preferences
        </button>
      </div>

      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">Backup &amp; restore</h2>
        <p class="mt-1 text-xs text-tf-muted">
          Export saves workflows, graph, variables, and non-secret settings as <code class="text-[11px] text-neutral-500">taskforge-data.json</code> inside a ZIP.
          Import <strong class="text-amber-100/90">replaces all workflows</strong> (and execution history for them), all variables, and merges non-secret settings from the file. Your license key and API secrets are never imported.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            (click)="exportZip()"
            class="rounded-lg border border-tf-border px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Export data as ZIP…
          </button>
          <button
            type="button"
            (click)="importZip()"
            class="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 hover:bg-amber-500/15"
          >
            Import from ZIP…
          </button>
        </div>
      </div>

      <div class="rounded-xl border border-tf-border bg-tf-card p-4">
        <h2 class="text-sm font-medium">Maintenance</h2>
        <p class="mt-1 text-xs text-tf-muted">
          Reset automation, UI, and trigger preferences (everything in “Automation &amp; logs” and “UI &amp; appearance”) to defaults.
          Does not remove your license, AI settings, or workflows.
        </p>
        <button
          type="button"
          (click)="resetPreferences()"
          class="mt-3 rounded-lg border border-tf-border px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
        >
          Reset preferences to defaults
        </button>
      </div>

      <div class="rounded-xl border border-red-500/35 bg-red-500/5 p-4">
        <h2 class="text-sm font-medium text-red-200">Danger zone</h2>
        <p class="mt-1 text-xs text-tf-muted">
          Permanently delete <strong class="text-neutral-300">all workflows</strong> (and their run history),
          <strong class="text-neutral-300">all variables</strong>, audit log entries, non–self team members, and stored API keys.
          Your organization license and AI settings in Settings are kept (values not wiped).
        </p>
        <button
          type="button"
          (click)="clearAllUserData()"
          class="mt-3 rounded-lg border border-red-500/50 bg-red-500/15 px-4 py-2 text-sm text-red-100 hover:bg-red-500/25"
        >
          Erase all automation data…
        </button>
      </div>
    </div>
  `,
})
export class SettingsPageComponent implements OnInit {
  protected readonly ipc = inject(IpcService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly loading = inject(LoadingService);
  protected readonly isViewer = signal(false);

  protected openaiKey = '';
  /** Matches `electron/ai-workflow.ts` defaults. */
  protected aiProvider: 'openai' | 'local' = 'openai';
  protected localAiBaseUrl = 'http://127.0.0.1:11435';
  protected localAiModel = 'llama3.2';
  protected localAiGatewayToken = '';
  protected entitlementKey = '';
  protected logRetentionDays = 30;
  protected logRetentionForever = false;
  protected clearLogsOnStartup = false;
  protected replayMissedCron = false;
  protected defaultWorkflowPriority: 'normal' | 'high' | 'low' = 'normal';
  protected soundOnWorkflowFailure = false;
  protected engineAutoStart = true;
  protected notifyDesktop = true;
  protected maxConcurrentWorkflows = 5;
  protected confirmDeleteWorkflow = true;
  protected uiLocale = 'en';
  protected uiTheme: 'dark' | 'light' = 'dark';
  protected uiAccent: 'green' | 'blue' | 'amber' | 'violet' = 'green';
  protected toastPosition: 'top' | 'bottom' = 'bottom';
  protected builderShowJsonDefault = false;
  protected readonly savedAiSettings = signal(false);
  protected readonly savedPrefs = signal(false);
  protected readonly showUnlockBanner = signal(false);
  /** unset | ok | invalid | network — feedback after save attempt */
  protected readonly entitlementStatus = signal<'unset' | 'ok' | 'invalid' | 'network'>('unset');
  protected readonly licenseServerConfigured = signal(false);
  protected readonly licenseMode = signal('local');
  protected readonly licenseLastVerifiedAt = signal<string | null>(null);
  protected readonly licenseValidUntilDisplay = signal<string | null>(null);
  protected readonly licenseSeats = signal<number | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loading.run(() => this.loadSettingsForm());
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      if (unlocked) {
        const team = (await this.ipc.api.team.list()) as Array<{ is_self: number; role: string }>;
        const self = team.find((m) => m.is_self === 1);
        this.isViewer.set(self?.role === 'Viewer');
      }
    } catch {
      /* no team data — free user, treat as non-viewer */
    }
  }

  private async loadSettingsForm(): Promise<void> {
    this.showUnlockBanner.set(this.route.snapshot.queryParamMap.get('unlock') === '1');
    const ek = await this.ipc.api.settings.get('pro_entitlement_key');
    this.entitlementKey = ek ?? '';
    const st = await this.ipc.api.entitlement.getStatus();
    this.licenseServerConfigured.set(!!st.licenseServerConfigured);
    this.licenseMode.set(st.licenseMode ?? 'local');
    if (st.unlocked) this.entitlementStatus.set('ok');
    this.licenseLastVerifiedAt.set(st.licenseLastVerifiedAt ?? null);
    this.licenseValidUntilDisplay.set(st.licenseValidUntil ?? null);
    this.licenseSeats.set(st.seats ?? null);

    const v = await this.ipc.api.settings.get('openai_api_key');
    this.openaiKey = v ?? '';
    const ap = await this.ipc.api.settings.get('ai_provider');
    this.aiProvider = ap === 'local' ? 'local' : 'openai';
    const lb = await this.ipc.api.settings.get('local_ai_base_url');
    if (lb != null && lb !== '') this.localAiBaseUrl = lb;
    else this.localAiBaseUrl = 'http://127.0.0.1:11435';
    const lm = await this.ipc.api.settings.get('local_ai_model');
    if (lm != null && lm !== '') this.localAiModel = lm;
    else this.localAiModel = 'llama3.2';
    const lgt = await this.ipc.api.settings.get('local_ai_gateway_token');
    this.localAiGatewayToken = lgt ?? '';
    const lr = await this.ipc.api.settings.get('log_retention_days');
    if (lr != null && lr !== '') this.logRetentionDays = Math.max(1, parseInt(lr, 10) || 30);
    const ea = await this.ipc.api.settings.get('engine_auto_start');
    if (ea != null) this.engineAutoStart = ea === '1' || ea === 'true';
    const nd = await this.ipc.api.settings.get('notify_desktop');
    if (nd != null) this.notifyDesktop = nd === '1' || nd === 'true';
    const mc = await this.ipc.api.settings.get('max_concurrent_workflows');
    if (mc != null && mc !== '') this.maxConcurrentWorkflows = Math.min(50, Math.max(1, parseInt(mc, 10) || 5));
    const cd = await this.ipc.api.settings.get('confirm_delete_workflow');
    if (cd != null) this.confirmDeleteWorkflow = cd === '1' || cd === 'true';
    const lf = await this.ipc.api.settings.get('log_retention_forever');
    if (lf != null) this.logRetentionForever = lf === '1' || lf === 'true';
    const cls = await this.ipc.api.settings.get('clear_logs_on_startup');
    if (cls != null) this.clearLogsOnStartup = cls === '1' || cls === 'true';
    const rmc = await this.ipc.api.settings.get('replay_missed_cron');
    if (rmc != null) this.replayMissedCron = rmc === '1' || rmc === 'true';
    const dfp = await this.ipc.api.settings.get('default_workflow_priority');
    if (dfp === 'high' || dfp === 'low' || dfp === 'normal') this.defaultWorkflowPriority = dfp;
    const snd = await this.ipc.api.settings.get('sound_on_workflow_failure');
    if (snd != null) this.soundOnWorkflowFailure = snd === '1' || snd === 'true';
    const loc = await this.ipc.api.settings.get('ui_locale');
    if (loc === 'en' || loc === 'de' || loc === 'fr') this.uiLocale = loc;
    const th = await this.ipc.api.settings.get('ui_theme');
    if (th === 'dark' || th === 'light') this.uiTheme = th;
    const ac = await this.ipc.api.settings.get('ui_accent');
    if (ac === 'green' || ac === 'blue' || ac === 'amber' || ac === 'violet') this.uiAccent = ac;
    const tp = await this.ipc.api.settings.get('toast_position');
    if (tp === 'top' || tp === 'bottom') this.toastPosition = tp;
    const bj = await this.ipc.api.settings.get('builder_show_json_default');
    if (bj != null) this.builderShowJsonDefault = bj === '1' || bj === 'true';
    this.applyUiToDocument();
  }

  async saveEntitlement(): Promise<void> {
    this.entitlementStatus.set('unset');
    const res = await this.ipc.api.entitlement.setKey(this.entitlementKey);
    if (res.ok) {
      this.entitlementStatus.set(res.unlocked ? 'ok' : 'unset');
      this.toast.success(res.unlocked ? 'License saved' : 'License cleared');
      this.showUnlockBanner.set(false);
      await this.loadSettingsForm();
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
      await this.loadSettingsForm();
    } else {
      this.toast.error(r.error ? `Check failed: ${r.error}` : 'License check failed');
    }
  }

  async clearEntitlement(): Promise<void> {
    this.entitlementKey = '';
    await this.saveEntitlement();
  }

  async saveAiSettings(): Promise<void> {
    if (this.isViewer()) { this.toast.warning('Viewers cannot change settings.'); return; }
    await this.ipc.api.settings.set('ai_provider', this.aiProvider);
    await this.ipc.api.settings.set('openai_api_key', this.openaiKey);
    await this.ipc.api.settings.set('local_ai_base_url', this.localAiBaseUrl.trim());
    await this.ipc.api.settings.set('local_ai_model', this.localAiModel.trim());
    await this.ipc.api.settings.set('local_ai_gateway_token', this.localAiGatewayToken);
    this.savedAiSettings.set(true);
    this.toast.success('AI settings saved');
    setTimeout(() => this.savedAiSettings.set(false), 2000);
  }

  async savePrefs(): Promise<void> {
    if (this.isViewer()) { this.toast.warning('Viewers cannot change settings.'); return; }
    await this.ipc.api.settings.set('log_retention_days', String(this.logRetentionDays));
    await this.ipc.api.settings.set('log_retention_forever', this.logRetentionForever ? '1' : '0');
    await this.ipc.api.settings.set('clear_logs_on_startup', this.clearLogsOnStartup ? '1' : '0');
    await this.ipc.api.settings.set('replay_missed_cron', this.replayMissedCron ? '1' : '0');
    await this.ipc.api.settings.set('default_workflow_priority', this.defaultWorkflowPriority);
    await this.ipc.api.settings.set('sound_on_workflow_failure', this.soundOnWorkflowFailure ? '1' : '0');
    await this.ipc.api.settings.set('engine_auto_start', this.engineAutoStart ? '1' : '0');
    await this.ipc.api.settings.set('notify_desktop', this.notifyDesktop ? '1' : '0');
    await this.ipc.api.settings.set('max_concurrent_workflows', String(this.maxConcurrentWorkflows));
    await this.ipc.api.settings.set('confirm_delete_workflow', this.confirmDeleteWorkflow ? '1' : '0');
    await this.ipc.api.settings.set('ui_locale', this.uiLocale);
    await this.ipc.api.settings.set('ui_theme', this.uiTheme);
    await this.ipc.api.settings.set('ui_accent', this.uiAccent);
    await this.ipc.api.settings.set('toast_position', this.toastPosition);
    await this.ipc.api.settings.set('builder_show_json_default', this.builderShowJsonDefault ? '1' : '0');
    this.applyUiToDocument();
    this.savedPrefs.set(true);
    this.toast.success('Preferences saved');
    setTimeout(() => this.savedPrefs.set(false), 2000);
  }

  private applyUiToDocument(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = this.uiLocale;
    document.documentElement.setAttribute('data-theme', this.uiTheme);
    const map: Record<string, string> = {
      green: '#22c55e',
      blue: '#3b82f6',
      amber: '#f59e0b',
      violet: '#a78bfa',
    };
    document.documentElement.style.setProperty('--color-tf-green', map[this.uiAccent] ?? map['green']);
  }

  async exportZip(): Promise<void> {
    try {
      const path = await this.ipc.api.data.exportZip();
      if (path) this.toast.success(`Exported to ${path}`);
      else this.toast.info('Export cancelled');
    } catch {
      this.toast.error('Could not export data');
    }
  }

  async importZip(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Replace workflows from backup?',
      message:
        'This will delete all current workflows and their run history, replace all variables, and merge non-secret settings from the ZIP. Your organization license and API keys on this device are not changed.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    try {
      const r = await this.ipc.api.data.importZip();
      if (!r.ok) {
        if (r.error === 'cancelled') return;
        this.toast.error(r.error);
        return;
      }
      this.toast.success(
        `Imported ${r.workflows} workflow(s), ${r.variables} variable(s); ${r.settingsApplied} setting row(s) merged.`
      );
      await this.loadSettingsForm();
    } catch {
      this.toast.error('Could not import data');
    }
  }

  async resetPreferences(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Reset preferences?',
      message: 'Automation and log preferences will return to defaults. Your workflows and secrets are not affected.',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    try {
      await this.ipc.api.settings.resetPreferences();
      await this.loadSettingsForm();
      this.toast.success('Preferences reset to defaults');
    } catch {
      this.toast.error('Could not reset preferences');
    }
  }

  async clearAllUserData(): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Erase all automation data?',
      message:
        'This removes every workflow, variable, execution history, audit log, invited team members, and API keys. License and OpenAI key entries stay in Settings (not cleared). This cannot be undone.',
      confirmLabel: 'Erase',
    });
    if (!ok) return;
    const ok2 = await this.confirm.confirm({
      title: 'Confirm permanent erase',
      message: 'Type nothing else — just confirm you want to delete all automation data on this device.',
      confirmLabel: 'Yes, delete everything',
    });
    if (!ok2) return;
    try {
      await this.ipc.api.data.clearUserData();
      this.toast.success('Automation data erased');
      await this.loadSettingsForm();
    } catch {
      this.toast.error('Could not erase data');
    }
  }
}
