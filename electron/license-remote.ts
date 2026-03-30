import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

/** Must match `PRO_ENTITLEMENT_SETTINGS_KEY` in entitlement.ts (avoid circular import). */
const STORED_LICENSE_KEY = 'pro_entitlement_key';

function readStoredLicenseKey(db: Database.Database): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(STORED_LICENSE_KEY) as { value: string } | undefined;
  return row?.value ?? '';
}

/** ISO timestamp — entitlement OK until this instant (renewed by successful server checks). */
export const LICENSE_VALID_UNTIL_KEY = 'license_entitlement_valid_until';
export const LICENSE_DEVICE_ID_KEY = 'license_device_id';
export const LICENSE_OFFLINE_GRACE_SEC_KEY = 'license_offline_grace_sec';

export type LicenseMode = 'local' | 'hybrid' | 'online_strict';

export function getLicenseMode(): LicenseMode {
  const m = (process.env.TASKFORGE_LICENSE_MODE ?? 'local').toLowerCase();
  if (m === 'hybrid' || m === 'online_strict') return m;
  return 'local';
}

/** Base URL for §20.9 license API; only `https` allowed in production path. */
export function getLicenseApiUrl(): string | undefined {
  const u = process.env.TASKFORGE_LICENSE_API_URL?.trim();
  if (!u) return undefined;
  if (!/^https:\/\//i.test(u)) return undefined;
  return u.replace(/\/$/, '');
}

export function getOrCreateDeviceId(db: Database.Database): string {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(LICENSE_DEVICE_ID_KEY) as { value: string } | undefined;
  if (row?.value) return row.value;
  const id = randomUUID();
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(LICENSE_DEVICE_ID_KEY, id);
  return id;
}

export function isOnlineEntitlementSatisfied(db: Database.Database): boolean {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(LICENSE_VALID_UNTIL_KEY) as { value: string } | undefined;
  if (!row?.value) return false;
  const until = new Date(row.value).getTime();
  if (Number.isNaN(until)) return false;
  return Date.now() < until;
}

export function clearOnlineEntitlementCache(db: Database.Database): void {
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(LICENSE_VALID_UNTIL_KEY);
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(LICENSE_OFFLINE_GRACE_SEC_KEY);
}

export async function refreshLicenseOnline(db: Database.Database): Promise<{ ok: boolean; error?: string }> {
  const base = getLicenseApiUrl();
  if (!base) return { ok: true };

  const key = readStoredLicenseKey(db);
  if (!key.trim()) {
    clearOnlineEntitlementCache(db);
    return { ok: false, error: 'no_key' };
  }

  const deviceId = getOrCreateDeviceId(db);
  const appVersion = process.env.npm_package_version ?? '2.1.0';
  const url = `${base}/v1/licenses/validate`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        license_key: key,
        device_id: deviceId,
        app_version: appVersion,
        product: 'taskforge-desktop',
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    let data: { valid?: boolean; refresh_after_sec?: number } = {};
    try {
      data = (await res.json()) as { valid?: boolean; refresh_after_sec?: number };
    } catch {
      /* non-JSON */
    }

    if (res.status === 401 || res.status === 403) {
      clearOnlineEntitlementCache(db);
      return { ok: false, error: 'invalid' };
    }

    if (!res.ok) {
      return { ok: false, error: `http_${res.status}` };
    }

    if (!data.valid) {
      clearOnlineEntitlementCache(db);
      return { ok: false, error: 'invalid' };
    }

    const refreshAfter =
      typeof data.refresh_after_sec === 'number' && data.refresh_after_sec > 0 ? data.refresh_after_sec : 86400 * 3;
    const validUntil = new Date(Date.now() + refreshAfter * 1000).toISOString();
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(LICENSE_VALID_UNTIL_KEY, validUntil);
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(LICENSE_OFFLINE_GRACE_SEC_KEY, String(refreshAfter));
    return { ok: true };
  } catch {
    clearTimeout(timer);
    return { ok: false, error: 'network' };
  }
}
