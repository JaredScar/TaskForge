/**
 * Windows dev: the taskbar shows the *executable* icon. While developing, that binary is
 * node_modules/electron/dist/electron.exe (Electron logo). Patch it once per install with our .ico.
 * No-op on macOS/Linux. Safe to run after every npm install (postinstall).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rcedit } from 'rcedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

if (process.platform !== 'win32') {
  process.exit(0);
}

const exe = path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const ico = path.join(root, 'public', 'taskforge.ico');

if (!fs.existsSync(exe)) {
  console.warn('[taskforge] electron.exe not found — skip dev EXE icon');
  process.exit(0);
}
if (!fs.existsSync(ico)) {
  console.warn('[taskforge] public/taskforge.ico missing — run: node scripts/generate-taskforge-ico.mjs');
  process.exit(0);
}

try {
  await rcedit(exe, { icon: path.resolve(ico) });
  console.log('[taskforge] Dev EXE icon set (electron.exe → taskforge.ico) for Windows taskbar.');
} catch (e) {
  console.warn('[taskforge] Could not patch electron.exe icon:', e instanceof Error ? e.message : e);
  process.exit(0);
}
