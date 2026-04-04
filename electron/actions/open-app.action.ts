import { spawn } from 'node:child_process';
import * as path from 'node:path';

function spawnArgsFromConfig(config: Record<string, unknown>): string[] {
  const raw = config['args'];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).filter((s) => s.length > 0);
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return [];
    return t.split(/\s+/).filter(Boolean);
  }
  return [];
}

function normalizeExe(config: Record<string, unknown>): string {
  const raw = String(config['path'] ?? config['executable'] ?? 'notepad.exe').trim();
  return raw.replace(/^["']+|["']+$/g, '');
}

/**
 * Launch a GUI/desktop app. On Windows we avoid `shell: true` for normal .exe / PATH names:
 * with `shell: true`, Node starts `cmd.exe` first, so `spawn` succeeds even when the target
 * command is missing — the workflow step incorrectly reports success while nothing opens.
 */
export function runOpenApplication(config: Record<string, unknown>): Promise<void> {
  const exe = normalizeExe(config);
  if (!exe) {
    return Promise.reject(new Error('No executable path configured'));
  }
  const args = spawnArgsFromConfig(config);
  const onWin = process.platform === 'win32';
  const ext = path.extname(exe).toLowerCase();

  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    if (onWin && ext === '.ps1') {
      const script = path.isAbsolute(exe) ? exe : path.resolve(process.cwd(), exe);
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
        { detached: true, stdio: 'ignore', windowsHide: false, shell: false }
      );
    } else if (onWin && (ext === '.bat' || ext === '.cmd')) {
      const batch = path.isAbsolute(exe) ? exe : path.resolve(process.cwd(), exe);
      child = spawn('cmd.exe', ['/c', 'call', batch, ...args], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      });
    } else {
      child = spawn(exe, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      });
    }

    child.on('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
