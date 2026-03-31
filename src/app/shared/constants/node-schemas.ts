export type FieldType = 'text' | 'number' | 'boolean' | 'select' | 'textarea' | 'cron';

export interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
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
    { key: 'path', label: 'Executable path', type: 'text' },
    { key: 'args', label: 'Arguments', type: 'text' },
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
};

export function schemaForKind(kind: string): SchemaField[] | undefined {
  return NODE_CONFIG_SCHEMAS[kind];
}
