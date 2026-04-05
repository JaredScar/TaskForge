export type NodeTier = 'free' | 'pro';
export type CatalogNodeType = 'trigger' | 'condition' | 'action';

export interface NodeCatalogEntry {
  kind: string;
  nodeType: CatalogNodeType;
  label: string;
  description: string;
  icon: string;
  tier: NodeTier;
  category: string;
}

export const NODE_CATALOG: readonly NodeCatalogEntry[] = [
  { kind: 'time_schedule', nodeType: 'trigger', label: 'Time schedule', description: 'Run on a cron schedule', icon: '🕐', tier: 'free', category: 'Time' },
  { kind: 'system_startup', nodeType: 'trigger', label: 'System startup', description: 'When you sign in to Windows', icon: '🚀', tier: 'free', category: 'Time' },
  { kind: 'interval_trigger', nodeType: 'trigger', label: 'Every N minutes', description: 'Simple repeating timer (no cron)', icon: '⏱', tier: 'free', category: 'Time' },
  { kind: 'power_event', nodeType: 'trigger', label: 'Power & session', description: 'AC/battery, sleep, resume, lock screen', icon: '🔋', tier: 'free', category: 'System' },
  { kind: 'app_launch', nodeType: 'trigger', label: 'App launch', description: 'When a process appears', icon: '📲', tier: 'free', category: 'Apps' },
  { kind: 'network_change', nodeType: 'trigger', label: 'Wi‑Fi / network', description: 'When SSID or connectivity matches', icon: '📶', tier: 'pro', category: 'System' },
  { kind: 'file_change', nodeType: 'trigger', label: 'File or folder', description: 'When files change under a path', icon: '📁', tier: 'pro', category: 'System' },
  { kind: 'cpu_memory_usage', nodeType: 'trigger', label: 'CPU / memory', description: 'When usage crosses a threshold', icon: '📈', tier: 'pro', category: 'System' },
  { kind: 'device_connected', nodeType: 'trigger', label: 'Device connected', description: 'Audio/USB-style device events (polled)', icon: '🎧', tier: 'pro', category: 'System' },
  { kind: 'idle_trigger', nodeType: 'trigger', label: 'User idle', description: 'After keyboard/mouse idle time', icon: '💤', tier: 'pro', category: 'System' },
  { kind: 'memory_trigger', nodeType: 'trigger', label: 'Memory usage', description: 'RAM percent above/below threshold', icon: '🧠', tier: 'pro', category: 'System' },
  { kind: 'device_trigger', nodeType: 'trigger', label: 'USB device change', description: 'When USB device count changes', icon: '🔌', tier: 'pro', category: 'System' },

  { kind: 'wifi_network', nodeType: 'condition', label: 'Wi‑Fi network', description: 'Require a specific SSID', icon: '📶', tier: 'free', category: 'Conditions' },
  { kind: 'time_window', nodeType: 'condition', label: 'Time window', description: 'Only between times of day', icon: '🪟', tier: 'free', category: 'Conditions' },
  { kind: 'app_running', nodeType: 'condition', label: 'App running', description: 'Require a process name', icon: '▶️', tier: 'free', category: 'Conditions' },

  { kind: 'open_application', nodeType: 'action', label: 'Open application', description: 'Launch an executable', icon: '🖥', tier: 'free', category: 'Actions' },
  { kind: 'show_notification', nodeType: 'action', label: 'Notification', description: 'Desktop toast', icon: '🔔', tier: 'free', category: 'Actions' },
  { kind: 'open_file_folder', nodeType: 'action', label: 'Open file/folder', description: 'Reveal in Explorer', icon: '📂', tier: 'free', category: 'Actions' },
  { kind: 'dark_mode_toggle', nodeType: 'action', label: 'Dark mode', description: 'Toggle Windows app theme', icon: '🌙', tier: 'free', category: 'Actions' },
  { kind: 'audio_control', nodeType: 'action', label: 'Audio', description: 'Mute/unmute/volume', icon: '🔊', tier: 'free', category: 'Actions' },
  { kind: 'run_script', nodeType: 'action', label: 'Run script', description: 'PowerShell, CMD, or Bash', icon: '📜', tier: 'pro', category: 'Actions' },
  { kind: 'http_request', nodeType: 'action', label: 'HTTP request', description: 'Call a URL', icon: '🌐', tier: 'pro', category: 'Actions' },
  { kind: 'zip_archive', nodeType: 'action', label: 'Create ZIP', description: 'Zip files or folders to a .zip path', icon: '🗜', tier: 'pro', category: 'Actions' },
  { kind: 'download_file', nodeType: 'action', label: 'Download file', description: 'Save a remote http(s) URL to disk', icon: '⬇', tier: 'pro', category: 'Actions' },
  { kind: 'wake_on_lan', nodeType: 'action', label: 'Wake-on-LAN', description: 'Send magic packet to a MAC address', icon: '⚡', tier: 'pro', category: 'Actions' },
  { kind: 'tcp_port_check', nodeType: 'action', label: 'TCP port check', description: 'Test if a host:port accepts connections', icon: '🔌', tier: 'pro', category: 'Actions' },
  { kind: 'screenshot_save', nodeType: 'action', label: 'Screenshot', description: 'Save primary screen to PNG', icon: '📸', tier: 'pro', category: 'Actions' },
  { kind: 'kill_process', nodeType: 'action', label: 'Kill process', description: 'End a process by name or PID', icon: '⛔', tier: 'free', category: 'Actions' },
  { kind: 'file_operation', nodeType: 'action', label: 'File operation', description: 'Copy, move, delete, mkdir', icon: '📋', tier: 'free', category: 'Actions' },
  { kind: 'open_url', nodeType: 'action', label: 'Open URL', description: 'Open http(s) link in default browser', icon: '🔗', tier: 'free', category: 'Actions' },
  { kind: 'clipboard_write', nodeType: 'action', label: 'Set clipboard', description: 'Copy text to the system clipboard', icon: '📌', tier: 'free', category: 'Actions' },
  { kind: 'write_text_file', nodeType: 'action', label: 'Write text file', description: 'Create, overwrite, or append a text file', icon: '📝', tier: 'free', category: 'Actions' },
  { kind: 'lock_workstation', nodeType: 'action', label: 'Lock screen', description: 'Lock Windows (Win+L equivalent)', icon: '🔒', tier: 'free', category: 'Actions' },
] as const;

export function catalogEntry(kind: string): NodeCatalogEntry | undefined {
  return NODE_CATALOG.find((e) => e.kind === kind);
}
