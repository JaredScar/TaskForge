import { spawn } from 'node:child_process';
import * as path from 'node:path';

export function runOpenApplication(config: Record<string, unknown>): Promise<void> {
  const exe = String(config['path'] ?? config['executable'] ?? 'notepad.exe');
  return new Promise((resolve, reject) => {
    const isAbsolute = path.isAbsolute(exe);
    const child = spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      shell: !isAbsolute,
      windowsHide: false,
    });
    child.on('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
