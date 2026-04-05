import { createHmac, timingSafeEqual } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getLicenseApiUrl, getLicenseMode, isOnlineEntitlementSatisfied } from './license-remote';
import { LEGACY_DEV_ENTITLEMENT_SECRET } from './legacy-paths';

/** Settings row key — Pro + Enterprise product entitlement (not the REST `api_key`). */
export const PRO_ENTITLEMENT_SETTINGS_KEY = 'pro_entitlement_key';

/** Dev / CI unlock; do not ship to paying customers as the only protection. */
export const DEV_ENTITLEMENT_BYPASS = 'local-dev-pro-enterprise';

/** Current prefix; legacy prefix still accepted for older signed keys (see `legacy-paths.ts`). */
const KEY_PREFIXES = new Set(['tfent1', 'adent1']);

export const PRO_TRIGGER_KINDS = new Set([
  'network_change',
  'file_change',
  'cpu_memory_usage',
  'device_connected',
  'idle_trigger',
  'memory_trigger',
  'device_trigger',
]);
export const PRO_ACTION_KINDS = new Set([
  'run_script',
  'http_request',
  'zip_archive',
  'download_file',
  'wake_on_lan',
  'tcp_port_check',
  'screenshot_save',
]);

function entitlementSecretCandidates(): readonly string[] {
  const e = process.env.TASKFORGE_ENTITLEMENT_SECRET?.trim();
  if (e) return [e];
  return ['taskforge-desktop-dev-entitlement-v1', LEGACY_DEV_ENTITLEMENT_SECRET];
}

/**
 * Validates `tfent1.<base64urlPayload>.<base64urlHmac>` (or the legacy three-part prefix) where HMAC-SHA256(secret, payload) matches.
 * Generate with: `node scripts/generate-entitlement-key.mjs`
 */
export function validateProEnterpriseKey(raw: string): boolean {
  const key = raw.trim();
  if (!key) return false;
  if (key === DEV_ENTITLEMENT_BYPASS) return true;
  const parts = key.split('.');
  if (parts.length !== 3 || !KEY_PREFIXES.has(parts[0]!)) return false;
  const [, payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return false;
  try {
    const a = Buffer.from(sigB64, 'utf8');
    let signatureOk = false;
    for (const secret of entitlementSecretCandidates()) {
      const expected = createHmac('sha256', secret).update(payloadB64).digest('base64url');
      const b = Buffer.from(expected, 'utf8');
      if (a.length === b.length && timingSafeEqual(a, b)) {
        signatureOk = true;
        break;
      }
    }
    if (!signatureOk) return false;
    try {
      const payloadJson = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { exp?: number };
      if (typeof payloadJson.exp === 'number' && payloadJson.exp < Math.floor(Date.now() / 1000)) return false;
    } catch {
      /* non-JSON payload: ignore exp */
    }
    return true;
  } catch {
    return false;
  }
}

export function readStoredEntitlementKey(db: Database.Database): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(PRO_ENTITLEMENT_SETTINGS_KEY) as
    | { value: string }
    | undefined;
  return row?.value ?? '';
}

/**
 * Pro/Enterprise unlock: local key (HMAC / dev bypass, optional JWT `exp` in payload) plus,
 * when `TASKFORGE_LICENSE_API_URL` is set, cached online validation per §20.9 (`hybrid` / `online_strict`).
 */
export function isProEnterpriseUnlocked(db: Database.Database): boolean {
  const key = readStoredEntitlementKey(db).trim();
  if (!key) return false;

  const apiUrl = getLicenseApiUrl();
  const mode = getLicenseMode();

  if (mode === 'online_strict' && apiUrl) {
    return isOnlineEntitlementSatisfied(db);
  }

  if (!validateProEnterpriseKey(readStoredEntitlementKey(db))) return false;
  if (!apiUrl || mode === 'local') return true;
  return isOnlineEntitlementSatisfied(db);
}

export class EntitlementRequiredError extends Error {
  readonly code = 'ENTITLEMENT_REQUIRED' as const;
  constructor() {
    super('ENTITLEMENT_REQUIRED');
    this.name = 'EntitlementRequiredError';
  }
}

export function assertProEnterprise(db: Database.Database): void {
  if (!isProEnterpriseUnlocked(db)) throw new EntitlementRequiredError();
}

/** True if any node uses a Pro trigger or Pro action kind. */
export function workflowNodesRequireProEntitlement(nodes: Array<Record<string, unknown>>): boolean {
  for (const n of nodes) {
    const nt = String(n['node_type'] ?? '');
    const kind = String(n['kind'] ?? '');
    if (nt === 'trigger' && PRO_TRIGGER_KINDS.has(kind)) return true;
    if (nt === 'action' && PRO_ACTION_KINDS.has(kind)) return true;
  }
  return false;
}
