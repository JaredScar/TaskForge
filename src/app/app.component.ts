import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { IpcService } from './core/services/ipc.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  private readonly ipc = inject(IpcService);

  async ngOnInit(): Promise<void> {
    if (!this.ipc.isElectron || typeof document === 'undefined') return;
    try {
      const loc = await this.ipc.api.settings.get('ui_locale');
      if (loc) document.documentElement.lang = loc.slice(0, 5);
      const th = await this.ipc.api.settings.get('ui_theme');
      document.documentElement.setAttribute('data-theme', th === 'light' ? 'light' : 'dark');
      const ac = await this.ipc.api.settings.get('ui_accent');
      const map: Record<string, string> = {
        green: '#22c55e',
        blue: '#3b82f6',
        amber: '#f59e0b',
        violet: '#a78bfa',
      };
      document.documentElement.style.setProperty('--color-tf-green', map[ac ?? 'green'] ?? map['green']);
    } catch {
      /* ignore */
    }
  }
}
