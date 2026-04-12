import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-empty-state',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-tf-border bg-tf-card/20 px-6 py-14 text-center"
    >
      <span class="text-4xl leading-none" aria-hidden="true">{{ icon() }}</span>
      <h2 class="mt-4 text-lg font-medium text-neutral-100">{{ title() }}</h2>
      <p class="mt-2 max-w-md text-sm leading-relaxed text-tf-muted">{{ description() }}</p>
      @if (ctaRoute(); as route) {
        @if (ctaLabel(); as label) {
          <a
            [routerLink]="linkParts(route)"
            class="mt-6 rounded-lg bg-tf-green px-4 py-2 text-sm font-medium text-black hover:opacity-90"
          >
            {{ label }}
          </a>
        }
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input<string>('📋');
  readonly title = input.required<string>();
  readonly description = input<string>('');
  readonly ctaLabel = input<string | undefined>(undefined);
  /** Absolute path e.g. `/workflows` or `/builder/new` */
  readonly ctaRoute = input<string | undefined>(undefined);

  protected linkParts(route: string): string[] {
    return route.replace(/^\//, '').split('/').filter(Boolean);
  }
}
