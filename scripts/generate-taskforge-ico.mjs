/**
 * Regenerate public/taskforge.ico from public/taskforge.png (Windows tray/taskbar + electron-builder).
 * `public/taskforge.png` must be a real PNG (starts with 0x89 PNG); a JPEG renamed .png will fail.
 * Run: node scripts/generate-taskforge-ico.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pngPath = path.join(root, 'public', 'taskforge.png');
const icoPath = path.join(root, 'public', 'taskforge.ico');

if (!fs.existsSync(pngPath)) {
  console.error('[taskforge] Missing', pngPath);
  process.exit(1);
}
const raw = fs.readFileSync(pngPath);
if (raw.length < 8 || raw[0] !== 0x89 || raw[1] !== 0x50 || raw[2] !== 0x4e || raw[3] !== 0x47) {
  console.error('[taskforge]', pngPath, 'is not a valid PNG file (wrong magic bytes). Use a real PNG.');
  process.exit(1);
}

const buf = await pngToIco(raw);
fs.writeFileSync(icoPath, buf);
console.log('[taskforge] Wrote', icoPath);
