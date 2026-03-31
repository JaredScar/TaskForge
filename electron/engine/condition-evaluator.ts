import * as si from 'systeminformation';
import type { WorkflowNodeRow } from '../types';
import { interpolateConfigString } from './variable-interpolation';

export async function evaluateCondition(
  node: WorkflowNodeRow,
  vars: Record<string, string> = {},
  context: Record<string, string> = {}
): Promise<{ ok: boolean; reason?: string }> {
  let config: Record<string, unknown>;
  try {
    const raw = interpolateConfigString(node.config, vars, context);
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: 'Invalid condition config' };
  }

  switch (node.kind) {
    case 'wifi_network': {
      try {
        const expected = String(config['ssid'] ?? '');
        const wifi = await si.wifiNetworks();
        const ok = expected ? wifi.some((w) => w.ssid === expected) : wifi.length > 0;
        return ok ? { ok: true } : { ok: false, reason: `WiFi mismatch (expected ${expected})` };
      } catch {
        return { ok: true };
      }
    }
    case 'time_window': {
      const start = String(config['start'] ?? '09:00');
      const end = String(config['end'] ?? '17:00');
      const now = new Date();
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const mins = now.getHours() * 60 + now.getMinutes();
      const startM = sh * 60 + sm;
      const endM = eh * 60 + em;
      const ok = startM <= endM ? mins >= startM && mins <= endM : mins >= startM || mins <= endM;
      return ok ? { ok: true } : { ok: false, reason: 'Outside time window' };
    }
    case 'app_running': {
      const procName = String(config['process'] ?? '').toLowerCase();
      const procs = await si.processes();
      const ok = procs.list.some((p) => p.name?.toLowerCase().includes(procName));
      return ok ? { ok: true } : { ok: false, reason: `Process not running: ${procName}` };
    }
    default:
      return { ok: true };
  }
}
