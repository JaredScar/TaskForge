import archiver from 'archiver';
import * as dgram from 'node:dgram';
import { createWriteStream } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as net from 'node:net';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { desktopCapturer } from 'electron';

function parseSourcesList(config: Record<string, unknown>): string[] {
  const raw = config['sources'];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function runZipArchive(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string; zipPath?: string }> {
  const outputPath = String(config['outputPath'] ?? '').trim();
  const paths = parseSourcesList(config);
  if (!outputPath) return { ok: false, error: 'Missing outputPath' };
  if (paths.length === 0) return { ok: false, error: 'Add at least one path in sources (newline or comma separated)' };

  const valid: { p: string; isDir: boolean }[] = [];
  for (const p of paths) {
    try {
      const st = await fsp.stat(p);
      valid.push({ p, isDir: st.isDirectory() });
    } catch {
      /* skip missing */
    }
  }
  if (valid.length === 0) {
    return { ok: false, error: 'No existing files or folders found for sources' };
  }

  const archive = archiver('zip', { zlib: { level: 6 } });
  const output = createWriteStream(outputPath);
  const done = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', (err: Error) => reject(err));
  });
  archive.pipe(output);

  for (const v of valid) {
    const base = path.basename(v.p);
    if (v.isDir) archive.directory(v.p, base);
    else archive.file(v.p, { name: base });
  }

  await archive.finalize();
  await done;
  return { ok: true, zipPath: outputPath };
}

export async function runDownloadFile(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string; bytes?: number }> {
  const urlStr = String(config['url'] ?? '').trim();
  const dest = String(config['destinationPath'] ?? '').trim();
  if (!urlStr || !dest) return { ok: false, error: 'Missing url or destinationPath' };
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { ok: false, error: 'Only http and https URLs are allowed' };
  }

  const res = await fetch(u, { redirect: 'follow' });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  if (!res.body) return { ok: false, error: 'Empty response body' };

  const ws = createWriteStream(dest);
  try {
    // Node fetch() body is a Web ReadableStream
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await pipeline(Readable.fromWeb(res.body as any), ws);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const st = await fsp.stat(dest).catch(() => null);
  const bytes = st ? Number(st.size) : 0;
  return { ok: true, bytes };
}

function parseMac(mac: string): Buffer {
  const hex = mac.replace(/[:-]/g, '');
  if (hex.length !== 12 || !/^[0-9a-fA-F]{12}$/.test(hex)) {
    throw new Error('MAC address must be 12 hex digits (e.g. AA:BB:CC:DD:EE:FF)');
  }
  return Buffer.from(hex, 'hex');
}

export function runWakeOnLan(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const mac = String(config['macAddress'] ?? '').trim();
  const broadcast = String(config['broadcast'] ?? '255.255.255.255').trim() || '255.255.255.255';
  const port = Math.min(65535, Math.max(1, Number(config['port'] ?? 9)));
  if (!mac) return Promise.resolve({ ok: false, error: 'Missing macAddress' });

  let macBuf: Buffer;
  try {
    macBuf = parseMac(mac);
  } catch (e) {
    return Promise.resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }

  const packet = Buffer.alloc(6 + 16 * 6);
  packet.fill(0xff, 0, 6);
  for (let i = 6; i < packet.length; i += 6) {
    macBuf.copy(packet, i);
  }

  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    sock.send(packet, port, broadcast, (err) => {
      try {
        sock.close();
      } catch {
        /* ignore */
      }
      if (err) resolve({ ok: false, error: err.message });
      else resolve({ ok: true });
    });
  });
}

export function runTcpPortCheck(config: Record<string, unknown>): Promise<{ ok: boolean; open?: boolean; error?: string }> {
  const host = String(config['host'] ?? '127.0.0.1').trim() || '127.0.0.1';
  const port = Number(config['port'] ?? 80);
  const timeoutMs = Math.min(60_000, Math.max(200, Number(config['timeoutMs'] ?? 5000)));
  const expectOpen = String(config['expectOpen'] ?? 'true').toLowerCase() !== 'false';

  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return Promise.resolve({ ok: false, error: 'Invalid port' });
  }

  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (success: boolean, open: boolean, error?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      if (success) resolve({ ok: true, open });
      else resolve({ ok: false, open, error });
    };

    const timer = setTimeout(() => {
      if (expectOpen) finish(false, false, 'Timeout — port not reachable');
      else finish(true, false);
    }, timeoutMs);

    sock.once('connect', () => {
      if (expectOpen) finish(true, true);
      else finish(false, true, 'Port is open (expected closed)');
    });

    sock.once('error', () => {
      if (expectOpen) finish(false, false, 'Connection failed');
      else finish(true, false);
    });

    sock.connect(port, host);
  });
}

export async function runScreenshotSave(config: Record<string, unknown>): Promise<{ ok: boolean; error?: string; path?: string }> {
  const outPath = String(config['path'] ?? '').trim();
  if (!outPath) return { ok: false, error: 'Missing path' };

  const width = Math.min(7680, Math.max(640, Number(config['width'] ?? 1920)));
  const height = Math.min(4320, Math.max(480, Number(config['height'] ?? 1080)));

  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height },
    });
    if (!sources.length) return { ok: false, error: 'No screen capture sources' };
    const img = sources[0]!.thumbnail;
    const png = img.toPNG();
    await fsp.writeFile(outPath, png);
    return { ok: true, path: outPath };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
