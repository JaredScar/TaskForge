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
      return { path: 'notepad.exe', label: 'Open application' };
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
    case 'kill_process':
      return { processName: 'notepad.exe', label: 'Kill process' };
    case 'file_operation':
      return { operation: 'copy', source: '', destination: '', label: 'File operation' };
    default:
      return { label: kind };
  }
}
