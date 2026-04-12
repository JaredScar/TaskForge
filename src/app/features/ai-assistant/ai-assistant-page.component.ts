import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IpcService } from '../../core/services/ipc.service';
import { ToastService } from '../../core/services/toast.service';
import { isEntitlementRequiredError } from '../../core/utils/entitlement-error';
import { TfProIfDirective } from '../../core/directives/tf-pro-if.directive';

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
  /** PLAN §10.4 — hint when draft is from local keyword parser. */
  heuristicHint?: string;
};

type ChatTurn = { role: 'user' | 'assistant'; content: string };

/** Keep recent turns so prompts stay within a reasonable context budget (PLAN §10.3). */
const MAX_CONVERSATION_CHARS = 10_000;

function trimConversationForModel(turns: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  let total = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    const t = turns[i];
    const len = t.content.length;
    if (total + len > MAX_CONVERSATION_CHARS && out.length > 0) break;
    out.push(t);
    total += len;
  }
  return out.reverse();
}

@Component({
  selector: 'app-ai-assistant-page',
  imports: [FormsModule, RouterLink, TfProIfDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-template #proGate>
      <div class="flex flex-col items-center gap-4 py-16 text-center">
        <span class="text-4xl">✨</span>
        <h2 class="text-lg font-semibold">AI Assistant is a Pro feature</h2>
        <p class="max-w-sm text-sm text-tf-muted">Describe what you want to automate in plain English and let AI build the workflow for you.</p>
        <a routerLink="/settings" [queryParams]="{ unlock: '1' }" class="rounded-xl bg-tf-green px-5 py-2.5 text-sm font-semibold text-black hover:opacity-90">
          Unlock Pro
        </a>
      </div>
    </ng-template>
    <div *tfProIf="proGate" class="mx-auto max-w-2xl">
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
      @if (draftWorkflowId()) {
        <label class="mt-4 flex cursor-pointer items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" [(ngModel)]="refineLastDraft" />
          Refine last draft (update the same workflow in Builder instead of creating a new one)
        </label>
      }
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
          @if (p.heuristicHint) {
            <p class="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/95">{{ p.heuristicHint }}</p>
          }
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
export class AiAssistantPageComponent implements OnInit {
  private readonly ipc = inject(IpcService);
  private readonly toast = inject(ToastService);
  protected readonly suggestions = SUGGESTIONS;
  protected readonly isViewer = signal(false);
  protected promptText = '';
  protected readonly busy = signal(false);

  ngOnInit(): void {
    void this.loadViewerFlag();
  }

  private async loadViewerFlag(): Promise<void> {
    try {
      const { unlocked } = await this.ipc.api.entitlement.getStatus();
      if (unlocked) {
        const team = (await this.ipc.api.team.list()) as Array<{ is_self: number; role: string }>;
        const self = team.find((m) => m.is_self === 1);
        this.isViewer.set(self?.role === 'Viewer');
      }
    } catch {
      /* treat as non-viewer */
    }
  }
  protected readonly preview = signal<DraftPreview | null>(null);
  protected readonly draftWorkflowId = signal<string | null>(null);
  protected readonly errorText = signal('');
  protected readonly streamPreview = signal('');
  /** Prior turns sent to the model (user + assistant summaries). */
  protected readonly conversation = signal<ChatTurn[]>([]);
  /** When set and a draft exists, `workflows.update` replaces nodes on that workflow (§10.3). */
  protected refineLastDraft = false;

  async send(): Promise<void> {
    if (this.isViewer()) { this.toast.warning('Viewers cannot create workflows via AI.'); return; }
    const text = this.promptText.trim();
    if (!text || this.busy()) return;
    this.busy.set(true);
    this.preview.set(null);
    const existingId = this.refineLastDraft ? this.draftWorkflowId() : null;
    if (!this.refineLastDraft) {
      this.draftWorkflowId.set(null);
    }
    this.errorText.set('');
    this.streamPreview.set('');
    const history = trimConversationForModel(this.conversation()).map((m) => ({ role: m.role, content: m.content }));
    const offToken = this.ipc.api.ai.onStreamToken((chunk) => {
      this.streamPreview.update((s) => s + chunk);
    });
    try {
      const draft = await this.ipc.api.ai.parseStream({ prompt: text, messages: history });
      const nodes = (draft.nodes ?? []) as Array<Record<string, unknown>>;
      const heuristicHint =
        draft.source === 'heuristic'
          ? (draft.confidence != null && draft.confidence < 0.52
              ? 'Low-confidence keyword match — refine the trigger and action in Builder. In Settings, add an OpenAI API key (cloud) or switch to Local gateway with Ollama + taskforge-local-ai-gateway running.'
              : `Keyword-based draft (~${Math.round((draft.confidence ?? 0.5) * 100)}% match). For full model output, use OpenAI in Settings or Local gateway (see local-ai-gateway/README.md).`)
          : undefined;
      let id: string;
      const mapped = nodes.map((n, i) => ({
        id: crypto.randomUUID(),
        node_type: String(n['node_type'] ?? 'action'),
        kind: String(n['kind'] ?? 'show_notification'),
        config: n['config'] ?? {},
        position_x: 0,
        position_y: 0,
        sort_order: Number(n['sort_order'] ?? i),
      }));
      if (existingId) {
        id = existingId;
        await this.ipc.api.workflows.update(
          JSON.parse(JSON.stringify({ id, name: draft.name, nodes: mapped, draft: true })) as Record<string, unknown>
        );
      } else {
        id = await this.ipc.api.workflows.create({ name: draft.name, description: 'Generated by AI' });
        await this.ipc.api.workflows.update(
          JSON.parse(JSON.stringify({ id, nodes: mapped, draft: true })) as Record<string, unknown>
        );
      }
      this.draftWorkflowId.set(id);
      this.preview.set({
        name: draft.name,
        nodes: mapped.map((n) => ({ node_type: n.node_type, kind: n.kind })),
        rawJson: JSON.stringify(draft, null, 2),
        heuristicHint,
      });
      this.toast.success(existingId ? 'Draft updated — open in Builder to review' : 'Draft created — open in Builder to refine');
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
