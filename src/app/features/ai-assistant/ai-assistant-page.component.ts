import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { isEntitlementRequiredError } from '../../core/utils/entitlement-error';

const SUGGESTIONS = [
  'Open Spotify when I plug in headphones',
  'Start my work apps every morning',
  'Show a reminder every weekday at 9am',
  'Run a PowerShell script when CPU is high',
];

type DraftPreview = {
  name: string;
  nodes: Array<{ node_type: string; kind: string }>;
  rawJson: string;
};

type ChatTurn = { role: 'user' | 'assistant'; content: string };

@Component({
  selector: 'app-ai-assistant-page',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="mx-auto max-w-2xl">
      <div class="flex items-center gap-3">
        <span class="text-3xl">🤖</span>
        <div>
          <h1 class="text-xl font-semibold">AI Workflow Assistant</h1>
          <p class="text-sm text-tf-muted">Describe what you want to automate</p>
        </div>
      </div>
      <p class="mt-6 text-xs font-medium uppercase text-tf-muted">Try asking</p>
      <div class="mt-2 flex flex-wrap gap-2">
        @for (s of suggestions; track s) {
          <button
            type="button"
            (click)="promptText = s"
            class="rounded-full border border-tf-border bg-tf-card px-3 py-1.5 text-left text-xs hover:border-tf-green"
          >
            {{ s }}
          </button>
        }
      </div>
      <div class="mt-8 flex gap-2 rounded-xl border border-tf-border bg-tf-card p-2">
        <input
          [(ngModel)]="promptText"
          class="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
          placeholder="Describe what you want to automate…"
          (keyup.enter)="send()"
        />
        <button
          type="button"
          (click)="send()"
          [disabled]="busy()"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tf-green text-black disabled:opacity-50"
        >
          ➤
        </button>
      </div>
      @if (streamPreview()) {
        <div class="mt-6 rounded-xl border border-tf-border bg-tf-bg/80 p-3">
          <p class="text-[10px] font-medium uppercase text-tf-muted">Model output (streaming)</p>
          <pre class="mt-2 max-h-40 overflow-auto font-mono text-[11px] text-neutral-400">{{ streamPreview() }}</pre>
        </div>
      }
      @if (preview(); as p) {
        <div class="mt-6 rounded-xl border border-tf-border bg-tf-card p-4">
          <p class="text-xs font-medium uppercase text-tf-muted">Draft preview</p>
          <h2 class="mt-2 text-lg font-semibold text-neutral-100">{{ p.name }}</h2>
          <div class="mt-3 flex flex-wrap gap-2">
            @for (n of p.nodes; track $index) {
              <span
                class="inline-flex items-center gap-1 rounded-full border border-tf-border bg-tf-bg px-2.5 py-1 text-xs text-neutral-300"
              >
                <span class="text-tf-muted">{{ n.node_type }}</span>
                <span class="text-tf-green">{{ n.kind }}</span>
              </span>
            }
          </div>
          <div class="mt-4 flex flex-wrap gap-2">
            @if (draftWorkflowId(); as wid) {
              <a
                [routerLink]="['/builder', wid]"
                class="rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black hover:opacity-90"
              >
                Review in Builder
              </a>
            }
          </div>
        </div>
        <details class="mt-4 rounded-lg border border-tf-border bg-tf-bg/50">
          <summary class="cursor-pointer px-3 py-2 text-xs font-medium text-tf-muted">Developer view (JSON)</summary>
          <pre class="max-h-48 overflow-auto p-3 font-mono text-[11px] text-neutral-400">{{ p.rawJson }}</pre>
        </details>
      }
      @if (errorText()) {
        <p class="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{{ errorText() }}</p>
      }
    </div>
  `,
})
export class AiAssistantPageComponent {
  private readonly ipc = inject(IpcService);
  private readonly toast = inject(ToastService);
  protected readonly suggestions = SUGGESTIONS;
  protected promptText = '';
  protected readonly busy = signal(false);
  protected readonly preview = signal<DraftPreview | null>(null);
  protected readonly draftWorkflowId = signal<string | null>(null);
  protected readonly errorText = signal('');
  protected readonly streamPreview = signal('');
  /** Prior turns sent to the model (user + assistant summaries). */
  protected readonly conversation = signal<ChatTurn[]>([]);

  async send(): Promise<void> {
    const text = this.promptText.trim();
    if (!text || this.busy()) return;
    this.busy.set(true);
    this.preview.set(null);
    this.draftWorkflowId.set(null);
    this.errorText.set('');
    this.streamPreview.set('');
    const history = this.conversation().map((m) => ({ role: m.role, content: m.content }));
    const offToken = this.ipc.api.ai.onStreamToken((chunk) => {
      this.streamPreview.update((s) => s + chunk);
    });
    try {
      const draft = await this.ipc.api.ai.parseStream({ prompt: text, messages: history });
      const nodes = (draft.nodes ?? []) as Array<Record<string, unknown>>;
      const id = await this.ipc.api.workflows.create({ name: draft.name, description: 'Generated by AI' });
      const mapped = nodes.map((n, i) => ({
        id: crypto.randomUUID(),
        node_type: String(n['node_type'] ?? 'action'),
        kind: String(n['kind'] ?? 'show_notification'),
        config: n['config'] ?? {},
        position_x: 0,
        position_y: 0,
        sort_order: Number(n['sort_order'] ?? i),
      }));
      await this.ipc.api.workflows.update(
        JSON.parse(JSON.stringify({ id, nodes: mapped, edges: [], draft: true })) as Record<string, unknown>
      );
      this.draftWorkflowId.set(id);
      this.preview.set({
        name: draft.name,
        nodes: mapped.map((n) => ({ node_type: n.node_type, kind: n.kind })),
        rawJson: JSON.stringify(draft, null, 2),
      });
      this.toast.success('Draft created — open in Builder to refine');
      this.conversation.update((c) => [
        ...c,
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: `${draft.name} — ${nodes.length} node(s). Open Builder to refine.`,
        },
      ]);
      this.promptText = '';
    } catch (e) {
      if (isEntitlementRequiredError(e)) {
        this.errorText.set('Pro license required for AI Assistant.');
        this.toast.warning('Add your organization license key in Settings.');
        return;
      }
      this.errorText.set(e instanceof Error ? e.message : String(e));
      this.toast.error('Could not generate workflow');
    } finally {
      offToken();
      this.streamPreview.set('');
      this.busy.set(false);
    }
  }
}
