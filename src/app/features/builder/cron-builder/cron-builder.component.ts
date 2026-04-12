import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

const PRESETS: { label: string; cron: string }[] = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily 9:00 AM', cron: '0 9 * * *' },
  { label: 'Weekdays 9:00 AM', cron: '0 9 * * 1-5' },
  { label: 'Midnight', cron: '0 0 * * *' },
];

@Component({
  selector: 'app-cron-builder',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-3 rounded-lg border border-tf-border bg-tf-bg p-3">
      <p class="text-[10px] font-medium uppercase text-tf-muted">Schedule</p>
      <div class="flex flex-wrap gap-2">
        @for (p of presets; track p.cron) {
          <button
            type="button"
            (click)="applyPreset(p.cron)"
            class="rounded border border-tf-border px-2 py-1 text-xs hover:bg-tf-card"
          >
            {{ p.label }}
          </button>
        }
      </div>
      <label class="block text-xs text-tf-muted">Cron expression</label>
      <input
        [ngModel]="cronLocal()"
        (ngModelChange)="onCronChange($event)"
        class="w-full rounded border border-tf-border bg-tf-card px-2 py-1.5 font-mono text-xs"
        spellcheck="false"
      />
      <p class="text-xs text-neutral-400">{{ humanPreview() }}</p>
    </div>
  `,
})
export class CronBuilderComponent {
  readonly cron = input.required<string>();
  readonly cronChange = output<string>();

  protected readonly presets = PRESETS;
  protected readonly cronLocal = signal('0 9 * * *');
  protected readonly humanPreview = signal('');

  constructor() {
    effect(() => {
      const val = this.cron() || '0 9 * * *';
      this.cronLocal.set(val);
      this.humanPreview.set(describeCron(val));
    });
  }

  applyPreset(c: string): void {
    this.cronLocal.set(c);
    this.push(c);
  }

  onCronChange(v: string): void {
    this.cronLocal.set(v);
    this.push(v);
  }

  private push(c: string): void {
    this.humanPreview.set(describeCron(c));
    this.cronChange.emit(c);
  }
}

function describeCron(expr: string): string {
  const p = expr.trim().split(/\s+/);
  if (p.length < 5) return 'Invalid cron (need 5 fields)';
  const [min, hour, dom, mon, dow] = p;
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every hour at minute 0';
  if (min === '0' && hour === '9' && dom === '*' && mon === '*' && dow === '*') return 'Every day at 9:00 AM';
  if (min === '0' && hour === '0' && dom === '*' && mon === '*' && dow === '*') return 'Every day at midnight';
  if (min === '0' && hour === '9' && dom === '*' && mon === '*' && dow === '1-5') return 'Weekdays at 9:00 AM';
  return `Cron: ${expr}`;
}
