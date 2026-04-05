export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'textarea' | 'cron';

export interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  /** Rich UI for `type: 'text'` (e.g. native file picker in Electron). */
  ui?: 'executablePicker';
}

/** Declarative config fields per node `kind` (matches engine JSON). */
export const NODE_CONFIG_SCHEMAS: Record<string, SchemaField[]> = {
  time_schedule: [
    { key: 'label', label: 'Label', type: 'text', placeholder: 'Human name' },
    { key: 'cron', label: 'Cron', type: 'cron' },
  ],
  system_startup: [{ key: 'label', label: 'Label', type: 'text' }],
  app_launch: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'process', label: 'Process (.exe)', type: 'text', placeholder: 'notepad.exe' },
  ],
  interval_trigger: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'intervalMinutes', label: 'Interval (minutes)', type: 'number', placeholder: '30' },
  ],
  power_event: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'event',
      label: 'When',
      type: 'select',
      options: [
        { value: 'on-ac', label: 'Plugged in (AC power)' },
        { value: 'on-battery', label: 'On battery' },
        { value: 'resume', label: 'System resumed from sleep' },
        { value: 'suspend', label: 'System suspending' },
        { value: 'lock-screen', label: 'Session locked' },
        { value: 'unlock-screen', label: 'Session unlocked' },
        { value: 'shutdown', label: 'System shutting down' },
      ],
    },
  ],
  network_change: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'ssid', label: 'SSID (empty = any)', type: 'text' },
  ],
  file_change: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'path', label: 'Path to watch', type: 'text' },
  ],
  cpu_memory_usage: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'cpuPercent', label: 'CPU % threshold', type: 'number' },
    { key: 'memPercent', label: 'Memory % threshold', type: 'number' },
  ],
  device_connected: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'device',
      label: 'Device focus',
      type: 'select',
      options: [
        { value: 'audio', label: 'Audio' },
        { value: 'usb', label: 'USB' },
      ],
    },
  ],
  idle_trigger: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'idleSeconds', label: 'Idle seconds', type: 'number' },
  ],
  memory_trigger: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'threshold', label: 'Memory %', type: 'number' },
    {
      key: 'comparison',
      label: 'Comparison',
      type: 'select',
      options: [
        { value: 'above', label: 'Above' },
        { value: 'below', label: 'Below' },
      ],
    },
  ],
  device_trigger: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'event',
      label: 'Event',
      type: 'select',
      options: [
        { value: 'connect', label: 'Connect' },
        { value: 'disconnect', label: 'Disconnect' },
      ],
    },
    {
      key: 'deviceType',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'usb', label: 'USB' },
        { value: 'audio', label: 'Audio' },
        { value: 'any', label: 'Any' },
      ],
    },
  ],

  wifi_network: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'ssid', label: 'SSID', type: 'text' },
  ],
  time_window: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'start', label: 'Start (HH:MM)', type: 'text', placeholder: '09:00' },
    { key: 'end', label: 'End (HH:MM)', type: 'text', placeholder: '17:00' },
  ],
  app_running: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'process', label: 'Process name contains', type: 'text' },
  ],

  open_application: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'path', label: 'Executable path', type: 'text', ui: 'executablePicker', placeholder: 'Path or click Browse…' },
    {
      key: 'args',
      label: 'Arguments',
      type: 'text',
      placeholder: 'e.g. http 8080 — ngrok needs a subcommand (http, tcp, …)',
    },
  ],
  show_notification: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'body', label: 'Body', type: 'textarea' },
  ],
  open_file_folder: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'path', label: 'Path', type: 'text' },
  ],
  dark_mode_toggle: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'toggle', label: 'Toggle' },
        { value: 'enable', label: 'Enable dark' },
        { value: 'disable', label: 'Disable dark' },
      ],
    },
  ],
  audio_control: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'action',
      label: 'Action',
      type: 'select',
      options: [
        { value: 'mute', label: 'Mute' },
        { value: 'unmute', label: 'Unmute' },
        { value: 'set-volume', label: 'Set volume' },
      ],
    },
    { key: 'volume', label: 'Volume 0–100', type: 'number' },
  ],
  run_script: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'shell',
      label: 'Shell',
      type: 'select',
      options: [
        { value: 'powershell', label: 'PowerShell' },
        { value: 'cmd', label: 'CMD' },
        { value: 'bash', label: 'Bash' },
      ],
    },
    { key: 'path', label: 'Script path', type: 'text' },
    { key: 'script', label: 'Inline script', type: 'textarea' },
  ],
  http_request: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'method',
      label: 'Method',
      type: 'select',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'DELETE', label: 'DELETE' },
      ],
    },
    { key: 'url', label: 'URL', type: 'text' },
    { key: 'body', label: 'Body', type: 'textarea' },
    { key: 'retryCount', label: 'Retries on failure', type: 'number' },
    { key: 'retryDelayMs', label: 'Retry delay (ms)', type: 'number' },
  ],
  zip_archive: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'outputPath', label: 'Output .zip path', type: 'text', placeholder: 'C:\\Backups\\archive.zip' },
    {
      key: 'sources',
      label: 'Paths to include (one per line or comma-separated)',
      type: 'textarea',
      placeholder: 'C:\\Users\\me\\Documents\\project\nD:\\photo.jpg',
    },
  ],
  download_file: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'url', label: 'URL', type: 'text', placeholder: 'https://…' },
    { key: 'destinationPath', label: 'Save as', type: 'text', placeholder: 'C:\\Downloads\\file.bin' },
  ],
  wake_on_lan: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'macAddress', label: 'MAC address', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF' },
    { key: 'broadcast', label: 'Broadcast IP', type: 'text', placeholder: '255.255.255.255' },
    { key: 'port', label: 'UDP port (usually 7 or 9)', type: 'number' },
  ],
  tcp_port_check: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'host', label: 'Host', type: 'text', placeholder: '127.0.0.1' },
    { key: 'port', label: 'Port', type: 'number' },
    { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number' },
    {
      key: 'expectOpen',
      label: 'Expect port open',
      type: 'select',
      options: [
        { value: 'true', label: 'Yes — fail if closed' },
        { value: 'false', label: 'No — fail if open (expect closed)' },
      ],
    },
  ],
  screenshot_save: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'path', label: 'PNG file path', type: 'text', placeholder: 'C:\\Screens\\cap.png' },
    { key: 'width', label: 'Capture width (px)', type: 'number' },
    { key: 'height', label: 'Capture height (px)', type: 'number' },
  ],
  kill_process: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'processName', label: 'Process name (.exe)', type: 'text', placeholder: 'notepad.exe' },
    { key: 'pid', label: 'PID (optional)', type: 'text', placeholder: 'Leave empty to use name' },
  ],
  file_operation: [
    { key: 'label', label: 'Label', type: 'text' },
    {
      key: 'operation',
      label: 'Operation',
      type: 'select',
      options: [
        { value: 'copy', label: 'Copy' },
        { value: 'move', label: 'Move' },
        { value: 'rename', label: 'Rename' },
        { value: 'delete', label: 'Delete' },
        { value: 'mkdir', label: 'Mkdir' },
      ],
    },
    { key: 'source', label: 'Source path', type: 'text' },
    { key: 'destination', label: 'Destination', type: 'text', placeholder: 'For copy/move/rename' },
  ],
  open_url: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'url', label: 'URL (https://…)', type: 'text', placeholder: 'https://example.com' },
  ],
  clipboard_write: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'text', label: 'Text', type: 'textarea' },
  ],
  write_text_file: [
    { key: 'label', label: 'Label', type: 'text' },
    { key: 'path', label: 'File path', type: 'text' },
    { key: 'content', label: 'Content', type: 'textarea' },
    { key: 'append', label: 'Append (don’t overwrite)', type: 'boolean' },
  ],
  lock_workstation: [{ key: 'label', label: 'Label', type: 'text' }],
};

export function schemaForKind(kind: string): SchemaField[] | undefined {
  return NODE_CONFIG_SCHEMAS[kind];
}
