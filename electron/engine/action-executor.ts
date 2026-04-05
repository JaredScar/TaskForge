import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fsp from 'node:fs/promises';
import { clipboard, shell } from 'electron';
import type { WorkflowNodeRow } from '../types';
import { interpolateConfigString } from './variable-interpolation';
import { runOpenApplication } from '../actions/open-app.action';
import { runShowNotification } from '../actions/notification.action';
import { runOpenFileOrFolder } from '../actions/open-file.action';
import { runScript } from '../actions/run-script.action';
import { runHttpRequest } from '../actions/http-request.action';
import { runDarkModeToggle } from '../actions/dark-mode.action';
import { runAudioControl } from '../actions/audio-control.action';
import {
  runDownloadFile,
  runScreenshotSave,
  runTcpPortCheck,
  runWakeOnLan,
  runZipArchive,
} from '../actions/pro-actions';

const execFileAsync = promisify(execFile);

export interface StepResult {
  status: 'success' | 'failure';
  message: string;
  durationMs: number;
  error?: string;
  output?: string;
}

export async function executeActionNode(
  node: WorkflowNodeRow,
  vars: Record<string, string> = {},
  context: Record<string, string> = {}
): Promise<StepResult> {
  const start = Date.now();
  let config: Record<string, unknown>;
  try {
    const raw = interpolateConfigString(node.config, vars, context);
    config = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { status: 'failure', message: node.kind, durationMs: Date.now() - start, error: 'Invalid JSON config' };
  }

  try {
    switch (node.kind) {
      case 'open_application':
        await runOpenApplication(config);
        return { status: 'success', message: String(config['label'] ?? 'Open application'), durationMs: Date.now() - start };
      case 'show_notification':
        runShowNotification(config);
        return { status: 'success', message: String(config['label'] ?? 'Notification'), durationMs: Date.now() - start };
      case 'open_file_folder':
        await runOpenFileOrFolder(config);
        return { status: 'success', message: String(config['label'] ?? 'Open file/folder'), durationMs: Date.now() - start };
      case 'run_script': {
        const r = await runScript(config);
        const ok = !r.stderr;
        return {
          status: ok ? 'success' : 'failure',
          message: String(config['label'] ?? 'Run script'),
          durationMs: Date.now() - start,
          output: r.stdout,
          error: r.stderr || undefined,
        };
      }
      case 'http_request': {
        const r = await runHttpRequest(config);
        const ok = r.status >= 200 && r.status < 300;
        return {
          status: ok ? 'success' : 'failure',
          message: String(config['label'] ?? 'HTTP request'),
          durationMs: Date.now() - start,
          output: r.body,
          error: ok ? undefined : `HTTP ${r.status}`,
        };
      }
      case 'dark_mode_toggle': {
        const msg = await runDarkModeToggle(config);
        return { status: 'success', message: String(config['label'] ?? 'Dark mode'), durationMs: Date.now() - start, output: msg };
      }
      case 'audio_control': {
        const msg = await runAudioControl(config);
        return { status: 'success', message: String(config['label'] ?? 'Audio'), durationMs: Date.now() - start, output: msg };
      }
      case 'kill_process': {
        const pid = config['pid'];
        const processName = config['processName'] ?? config['process'];
        try {
          if (pid != null && pid !== '') {
            await execFileAsync('taskkill', ['/PID', String(pid), '/F'], { windowsHide: true });
          } else if (processName) {
            const im = String(processName).trim();
            await execFileAsync('taskkill', ['/IM', im, '/F'], { windowsHide: true });
          } else {
            return {
              status: 'failure',
              message: 'kill_process',
              durationMs: Date.now() - start,
              error: 'Set processName or pid in config',
            };
          }
          return {
            status: 'success',
            message: String(config['label'] ?? 'Kill process'),
            durationMs: Date.now() - start,
          };
        } catch (e) {
          return {
            status: 'failure',
            message: 'kill_process',
            durationMs: Date.now() - start,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      case 'file_operation': {
        const op = String(config['operation'] ?? 'copy').toLowerCase();
        const source = String(config['source'] ?? '').trim();
        const destination = String(config['destination'] ?? '').trim();
        const label = String(config['label'] ?? 'File operation');
        try {
          if (!source && op !== 'mkdir') {
            return { status: 'failure', message: label, durationMs: Date.now() - start, error: 'Missing source path' };
          }
          switch (op) {
            case 'copy':
              if (!destination) return { status: 'failure', message: label, durationMs: Date.now() - start, error: 'Missing destination' };
              await fsp.copyFile(source, destination);
              break;
            case 'move':
            case 'rename':
              if (!destination) return { status: 'failure', message: label, durationMs: Date.now() - start, error: 'Missing destination' };
              await fsp.rename(source, destination);
              break;
            case 'delete':
              await fsp.unlink(source);
              break;
            case 'mkdir':
              await fsp.mkdir(source, { recursive: true });
              break;
            default:
              return { status: 'failure', message: label, durationMs: Date.now() - start, error: `Unknown operation: ${op}` };
          }
          return { status: 'success', message: label, durationMs: Date.now() - start };
        } catch (e) {
          return {
            status: 'failure',
            message: label,
            durationMs: Date.now() - start,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      case 'open_url': {
        const label = String(config['label'] ?? 'Open URL');
        const raw = String(config['url'] ?? '').trim();
        let parsed: URL;
        try {
          parsed = new URL(raw);
        } catch {
          return {
            status: 'failure',
            message: label,
            durationMs: Date.now() - start,
            error: 'Invalid URL',
          };
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return {
            status: 'failure',
            message: label,
            durationMs: Date.now() - start,
            error: 'Only http and https URLs are allowed',
          };
        }
        await shell.openExternal(parsed.toString());
        return { status: 'success', message: label, durationMs: Date.now() - start };
      }
      case 'clipboard_write': {
        const label = String(config['label'] ?? 'Clipboard');
        const text = String(config['text'] ?? '');
        clipboard.writeText(text);
        return { status: 'success', message: label, durationMs: Date.now() - start };
      }
      case 'write_text_file': {
        const label = String(config['label'] ?? 'Write text file');
        const pathStr = String(config['path'] ?? '').trim();
        const content = String(config['content'] ?? '');
        const append = Boolean(config['append']);
        if (!pathStr) {
          return { status: 'failure', message: label, durationMs: Date.now() - start, error: 'Missing path' };
        }
        try {
          if (append) {
            await fsp.appendFile(pathStr, content, 'utf8');
          } else {
            await fsp.writeFile(pathStr, content, 'utf8');
          }
          return { status: 'success', message: label, durationMs: Date.now() - start };
        } catch (e) {
          return {
            status: 'failure',
            message: label,
            durationMs: Date.now() - start,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      case 'lock_workstation': {
        const label = String(config['label'] ?? 'Lock screen');
        if (process.platform !== 'win32') {
          return {
            status: 'failure',
            message: label,
            durationMs: Date.now() - start,
            error: 'lock_workstation is supported on Windows only',
          };
        }
        try {
          await execFileAsync('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true });
          return { status: 'success', message: label, durationMs: Date.now() - start };
        } catch (e) {
          return {
            status: 'failure',
            message: label,
            durationMs: Date.now() - start,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
      case 'zip_archive': {
        const label = String(config['label'] ?? 'Create ZIP');
        const r = await runZipArchive(config);
        return r.ok
          ? {
              status: 'success',
              message: label,
              durationMs: Date.now() - start,
              output: r.zipPath ?? '',
            }
          : { status: 'failure', message: label, durationMs: Date.now() - start, error: r.error };
      }
      case 'download_file': {
        const label = String(config['label'] ?? 'Download file');
        const r = await runDownloadFile(config);
        return r.ok
          ? {
              status: 'success',
              message: label,
              durationMs: Date.now() - start,
              output: r.bytes != null ? String(r.bytes) : '',
            }
          : { status: 'failure', message: label, durationMs: Date.now() - start, error: r.error };
      }
      case 'wake_on_lan': {
        const label = String(config['label'] ?? 'Wake-on-LAN');
        const r = await runWakeOnLan(config);
        return r.ok
          ? { status: 'success', message: label, durationMs: Date.now() - start }
          : { status: 'failure', message: label, durationMs: Date.now() - start, error: r.error };
      }
      case 'tcp_port_check': {
        const label = String(config['label'] ?? 'TCP port check');
        const r = await runTcpPortCheck(config);
        return r.ok
          ? {
              status: 'success',
              message: label,
              durationMs: Date.now() - start,
              output: r.open ? 'open' : 'closed',
            }
          : { status: 'failure', message: label, durationMs: Date.now() - start, error: r.error };
      }
      case 'screenshot_save': {
        const label = String(config['label'] ?? 'Screenshot');
        const r = await runScreenshotSave(config);
        return r.ok
          ? {
              status: 'success',
              message: label,
              durationMs: Date.now() - start,
              output: r.path ?? '',
            }
          : { status: 'failure', message: label, durationMs: Date.now() - start, error: r.error };
      }
      case 'input_simulation':
        return {
          status: 'failure',
          message: 'input_simulation',
          durationMs: Date.now() - start,
          error: 'Not implemented on this platform build (requires native module; see PLAN §15.1)',
        };
      default:
        return { status: 'failure', message: node.kind, durationMs: Date.now() - start, error: 'Unknown action kind' };
    }
  } catch (e) {
    return {
      status: 'failure',
      message: node.kind,
      durationMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
