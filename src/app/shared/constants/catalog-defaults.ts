/** Renderer copy of defaults (keep in sync with `electron/catalog-starters.ts`). */

export function defaultTriggerConfig(kind: string): Record<string, unknown> {
  switch (kind) {
    case 'time_schedule':
      return { cron: '0 9 * * *', label: '9:00 AM daily' };
    case 'app_launch':
      return { process: 'notepad.exe', label: 'When app opens' };
    case 'system_startup':
      return { label: 'On Windows login' };
    case 'network_change':
      return { ssid: '', label: 'WiFi / network change' };
    case 'file_change':
      return { path: '', label: 'File or folder watch' };
    case 'cpu_memory_usage':
      return { cpuPercent: 90, memPercent: 90, label: 'CPU or memory threshold' };
    case 'device_connected':
      return { device: 'audio', label: 'Device connected' };
    case 'idle_trigger':
      return { idleSeconds: 300, label: 'After idle' };
    case 'memory_trigger':
      return { threshold: 85, comparison: 'above', label: 'Memory threshold' };
    case 'device_trigger':
      return { event: 'connect', deviceType: 'usb', label: 'USB device change' };
    case 'interval_trigger':
      return { intervalMinutes: 30, label: 'Every 30 minutes' };
    case 'power_event':
      return { event: 'resume', label: 'When system resumes' };
    default:
      return { label: kind };
  }
}

export function defaultConditionConfig(kind: string): Record<string, unknown> {
  switch (kind) {
    case 'wifi_network':
      return { ssid: '', label: 'WiFi network' };
    case 'time_window':
      return { start: '09:00', end: '17:00', label: 'Time window' };
    case 'app_running':
      return { process: '', label: 'App running' };
    default:
      return { label: kind };
  }
}

export function defaultActionConfig(kind: string): Record<string, unknown> {
  switch (kind) {
    case 'open_application':
      return { path: 'notepad.exe', args: '', label: 'Open application' };
    case 'show_notification':
      return { title: 'TaskForge', body: 'Notification text', label: 'Show notification' };
    case 'open_file_folder':
      return { path: '', label: 'Open file or folder' };
    case 'dark_mode_toggle':
      return { mode: 'toggle', label: 'Dark mode' };
    case 'audio_control':
      return { action: 'mute', label: 'Audio control' };
    case 'run_script':
      return { path: '', shell: 'powershell', label: 'Run script' };
    case 'http_request':
      return { method: 'GET', url: 'https://example.com', label: 'HTTP request' };
    case 'zip_archive':
      return { outputPath: '', sources: '', label: 'Create ZIP' };
    case 'download_file':
      return { url: 'https://example.com/file.bin', destinationPath: '', label: 'Download file' };
    case 'wake_on_lan':
      return { macAddress: '00:11:22:33:44:55', broadcast: '255.255.255.255', port: 9, label: 'Wake-on-LAN' };
    case 'tcp_port_check':
      return { host: '127.0.0.1', port: 80, timeoutMs: 5000, expectOpen: true, label: 'Port check' };
    case 'screenshot_save':
      return { path: '', width: 1920, height: 1080, label: 'Screenshot' };
    case 'kill_process':
      return { processName: 'notepad.exe', label: 'Kill process' };
    case 'file_operation':
      return { operation: 'copy', source: '', destination: '', label: 'File operation' };
    case 'open_url':
      return { url: 'https://example.com', label: 'Open URL' };
    case 'clipboard_write':
      return { text: '', label: 'Copy to clipboard' };
    case 'write_text_file':
      return { path: '', content: '', append: false, label: 'Write text file' };
    case 'lock_workstation':
      return { label: 'Lock screen' };
    default:
      return { label: kind };
  }
}
