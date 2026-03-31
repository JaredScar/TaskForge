import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chart, registerables } from 'chart.js';
import { IpcService } from '../../core/services/ipc.service';

Chart.register(...registerables);

type TrendChip = { label: string; trend: 'up' | 'down' | 'flat'; favorable: boolean };

type Summary = {
  totalRuns: number;
  successRate: number;
  avgDurationSec: number;
  activeWorkflows: number;
  trends: {
    totalRuns: TrendChip;
    successRate: TrendChip;
    avgDurationSec: TrendChip;
    activeWorkflows: TrendChip;
  };
};

@Component({
  selector: 'app-analytics-page',
  imports: [NgClass, FormsModule],
  template: `
    <div>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold">Analytics Dashboard</h1>
          <p class="mt-1 text-sm text-tf-muted">Monitor workflow performance and usage</p>
        </div>
        <label class="flex items-center gap-2 text-sm text-tf-muted">
          Range
          <select
            [ngModel]="rangeDays()"
            (ngModelChange)="onRangeChange($event)"
            class="rounded-lg border border-tf-border bg-tf-card px-2 py-1.5 text-sm text-neutral-200"
          >
            <option [ngValue]="7">Last 7 days</option>
            <option [ngValue]="30">Last 30 days</option>
            <option [ngValue]="90">Last 90 days</option>
          </select>
        </label>
      </div>
      <div class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-tf-border bg-tf-card p-4">
          <p class="text-xs text-tf-muted">Runs (period)</p>
          <p class="mt-1 text-2xl font-bold">{{ summary()?.totalRuns ?? 0 }}</p>
          @if (summary(); as s) {
            <p class="mt-1 text-xs" [ngClass]="trendClass(s.trends.totalRuns)">{{ s.trends.totalRuns.label }}</p>
          }
        </div>
        <div class="rounded-xl border border-tf-border bg-tf-card p-4">
          <p class="text-xs text-tf-muted">Success Rate</p>
          <p class="mt-1 text-2xl font-bold">{{ summary()?.successRate ?? 0 }}%</p>
          @if (summary(); as s) {
            <p class="mt-1 text-xs" [ngClass]="trendClass(s.trends.successRate)">{{ s.trends.successRate.label }}</p>
          }
        </div>
        <div class="rounded-xl border border-tf-border bg-tf-card p-4">
          <p class="text-xs text-tf-muted">Avg Duration</p>
          <p class="mt-1 text-2xl font-bold">{{ summary()?.avgDurationSec ?? 0 }}s</p>
          @if (summary(); as s) {
            <p class="mt-1 text-xs" [ngClass]="trendClass(s.trends.avgDurationSec)">{{ s.trends.avgDurationSec.label }}</p>
          }
        </div>
        <div class="rounded-xl border border-tf-border bg-tf-card p-4">
          <p class="text-xs text-tf-muted">Active Workflows</p>
          <p class="mt-1 text-2xl font-bold">{{ summary()?.activeWorkflows ?? 0 }}</p>
          @if (summary(); as s) {
            <p class="mt-1 text-xs" [ngClass]="trendClass(s.trends.activeWorkflows)">{{ s.trends.activeWorkflows.label }}</p>
          }
        </div>
      </div>
      <div class="mt-8 grid gap-6 lg:grid-cols-2">
        <div class="rounded-xl border border-tf-border bg-tf-card p-4">
          <h2 class="text-sm font-medium">Runs by workflow</h2>
          <canvas #barChart class="mt-4 max-h-64"></canvas>
        </div>
        <div class="rounded-xl border border-tf-border bg-tf-card p-4">
          <h2 class="text-sm font-medium">Runs per day</h2>
          <canvas #lineChart class="mt-4 max-h-64"></canvas>
        </div>
        <div class="rounded-xl border border-tf-border bg-tf-card p-4 lg:col-span-2">
          <h2 class="text-sm font-medium">System Health</h2>
          <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            @for (m of healthRows(); track m.label) {
              <div>
                <div class="flex justify-between text-xs">
                  <span>{{ m.label }}</span>
                  <span>{{ m.pct }}%</span>
                </div>
                <div class="mt-1 h-2 overflow-hidden rounded-full bg-neutral-800">
                  <div class="h-full rounded-full bg-tf-green" [style.width.%]="m.pct"></div>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AnalyticsPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly ipc = inject(IpcService);
  @ViewChild('barChart') private barRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('lineChart') private lineRef?: ElementRef<HTMLCanvasElement>;

  protected readonly summary = signal<Summary | null>(null);
  protected readonly runs = signal<Array<{ id: string; name: string; run_count: number }>>([]);
  protected readonly timeSeries = signal<Array<{ day: string; count: number }>>([]);
  protected readonly health = signal({ cpu: 0, memory: 0, queue: 0, storageGb: 0 });
  protected readonly rangeDays = signal(7);
  private barChart?: Chart;
  private lineChart?: Chart;

  protected trendClass(t: TrendChip): Record<string, boolean> {
    if (t.trend === 'flat') return { 'text-tf-muted': true };
    return t.favorable ? { 'text-tf-green': true } : { 'text-red-400': true };
  }

  protected healthRows() {
    const h = this.health();
    return [
      { label: 'CPU Usage', pct: Math.min(100, h.cpu) },
      { label: 'Memory', pct: Math.min(100, h.memory) },
      { label: 'Queue Capacity', pct: Math.min(100, h.queue) },
      { label: 'Storage', pct: Math.min(100, h.storageGb * 2) },
    ];
  }

  ngOnInit(): void {
    void this.reloadData();
  }

  ngAfterViewInit(): void {
    this.ensureCharts();
  }

  ngOnDestroy(): void {
    this.barChart?.destroy();
    this.lineChart?.destroy();
  }

  protected onRangeChange(v: number): void {
    this.rangeDays.set(v);
    void this.reloadData();
  }

  private async reloadData(): Promise<void> {
    const d = this.rangeDays();
    const s = (await this.ipc.api.analytics.getSummary({ rangeDays: d })) as Summary;
    this.summary.set(s);
    const r = await this.ipc.api.analytics.getRunsByWorkflow({ rangeDays: d });
    this.runs.set(r);
    const ts = await this.ipc.api.analytics.getRunsTimeSeries({ rangeDays: Math.max(30, d) });
    this.timeSeries.set(ts as Array<{ day: string; count: number }>);
    const sys = await this.ipc.api.analytics.getSystemHealth();
    this.health.set(sys);
    this.updateCharts();
  }

  private ensureCharts(): void {
    const barEl = this.barRef?.nativeElement;
    const lineEl = this.lineRef?.nativeElement;
    if (!barEl || !lineEl) return;

    if (!this.barChart) {
      this.barChart = new Chart(barEl, {
        type: 'bar',
        data: { labels: [], datasets: [{ label: 'Runs', data: [], backgroundColor: 'rgba(34,197,94,0.6)' }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#a3a3a3' }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: '#a3a3a3' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
          },
        },
      });
    }
    if (!this.lineChart) {
      this.lineChart = new Chart(lineEl, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{ label: 'Runs', data: [], borderColor: 'rgb(34,197,94)', backgroundColor: 'rgba(34,197,94,0.15)', fill: true, tension: 0.25 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#a3a3a3' }, grid: { color: 'rgba(255,255,255,0.06)' } },
            y: { ticks: { color: '#a3a3a3' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
          },
        },
      });
    }
    this.updateCharts();
  }

  private updateCharts(): void {
    const r = this.runs();
    const labels = r.map((x) => (x.name.length > 18 ? x.name.slice(0, 16) + '…' : x.name));
    const data = r.map((x) => x.run_count);
    if (this.barChart) {
      this.barChart.data.labels = labels;
      if (this.barChart.data.datasets[0]) this.barChart.data.datasets[0].data = data;
      this.barChart.update();
    }

    const ts = this.timeSeries();
    const dLabels = ts.map((x) => x.day.slice(5));
    const dData = ts.map((x) => x.count);
    if (this.lineChart) {
      this.lineChart.data.labels = dLabels;
      if (this.lineChart.data.datasets[0]) this.lineChart.data.datasets[0].data = dData;
      this.lineChart.update();
    }
  }
}
