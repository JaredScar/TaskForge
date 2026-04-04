export interface MarketplaceTemplate {
  id: string;
  title: string;
  author: string;
  description: string;
  pro: boolean;
  nodes: Array<{ node_type: string; kind: string; config: Record<string, unknown> }>;
}

/** Built-in starter workflows shipped with the app (no third-party download or rating metrics). */
export const MARKETPLACE_ITEMS: MarketplaceTemplate[] = [
  {
    id: 'tmpl_meeting',
    title: 'Smart Meeting Prep',
    author: 'TaskForge',
    description: 'Example: time-based trigger plus a notification — customize times and message in the builder.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '*/5 * * * *', label: 'Every 5 min check' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Meeting', body: 'Prep workflow', label: 'Notify' } },
    ],
  },
  {
    id: 'tmpl_dev',
    title: 'Dev Environment Setup',
    author: 'TaskForge',
    description: 'Example: run actions after login — replace paths with your own apps in the builder.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'system_startup', config: { label: 'On login' } },
      { node_type: 'action', kind: 'open_application', config: { path: 'code', label: 'Open VS Code' } },
    ],
  },
  {
    id: 'tmpl_social',
    title: 'Scheduled HTTP request',
    author: 'TaskForge',
    description: 'Example: POST to a URL on a schedule — set the real endpoint and body in the builder.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 12 * * *', label: 'Noon' } },
      { node_type: 'action', kind: 'http_request', config: { url: 'https://example.com/post', method: 'POST', label: 'HTTP Request' } },
    ],
  },
  {
    id: 'tmpl_db',
    title: 'Database Backup Pro',
    author: 'TaskForge',
    description: 'Example: periodic script run — point to your real backup script path in the builder.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 */4 * * *', label: 'Every 4 hours' } },
      { node_type: 'action', kind: 'run_script', config: { path: 'C:\\backup.ps1', shell: 'powershell', label: 'Run Script' } },
    ],
  },
  {
    id: 'tmpl_morning_startup',
    title: 'Morning Startup Routine',
    author: 'TaskForge',
    description: 'Weekday 9:00 AM — open browser and Slack (edit paths in builder).',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 9 * * 1-5', label: '9 AM Mon–Fri' } },
      { node_type: 'action', kind: 'open_application', config: { path: 'chrome', label: 'Open browser' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Good morning', body: 'Startup routine', label: 'Notify' } },
    ],
  },
  {
    id: 'tmpl_clean_downloads',
    title: 'Clean Downloads (evening)',
    author: 'TaskForge',
    description: 'Late reminder to tidy downloads — replace with a real script path.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 23 * * *', label: '11 PM daily' } },
      { node_type: 'action', kind: 'run_script', config: { path: 'powershell', shell: 'powershell', label: 'Clean script' } },
    ],
  },
  {
    id: 'tmpl_shutdown_midnight',
    title: 'Shutdown reminder',
    author: 'TaskForge',
    description: 'Midnight notification — swap for a shutdown script if desired.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 0 * * *', label: 'Midnight' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'TaskForge', body: 'Time to shut down?', label: 'Reminder' } },
    ],
  },
  {
    id: 'tmpl_work_login',
    title: 'Work apps on login',
    author: 'TaskForge',
    description: 'On Windows login, launch common apps — set real executables.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'system_startup', config: { label: 'On login' } },
      { node_type: 'action', kind: 'open_application', config: { path: 'outlook', label: 'Mail' } },
      { node_type: 'action', kind: 'open_application', config: { path: 'ms-teams', label: 'Teams' } },
    ],
  },
  {
    id: 'tmpl_mute_headphones',
    title: 'Mute on disconnect (example)',
    author: 'TaskForge',
    description: 'Placeholder using device trigger — tune device type in builder.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'device_connected', config: { label: 'Device', device: 'audio' } },
      { node_type: 'action', kind: 'audio_control', config: { action: 'mute', label: 'Mute' } },
    ],
  },
  {
    id: 'tmpl_dark_evening',
    title: 'Dark mode evening',
    author: 'TaskForge',
    description: 'Switch to dark theme at 7 PM.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 19 * * *', label: '7 PM' } },
      { node_type: 'action', kind: 'dark_mode_toggle', config: { mode: 'dark', label: 'Dark mode' } },
    ],
  },
  {
    id: 'tmpl_light_morning',
    title: 'Light mode morning',
    author: 'TaskForge',
    description: 'Light theme at 7 AM.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 7 * * *', label: '7 AM' } },
      { node_type: 'action', kind: 'dark_mode_toggle', config: { mode: 'light', label: 'Light mode' } },
    ],
  },
  {
    id: 'tmpl_cpu_alert',
    title: 'High CPU alert',
    author: 'TaskForge',
    description: 'CPU threshold trigger + notification (Pro).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'cpu_memory_usage', config: { cpuPercent: 90, memPercent: 95, label: 'CPU > 90%' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'CPU', body: 'High usage', label: 'Alert' } },
    ],
  },
  {
    id: 'tmpl_welcome_startup',
    title: 'Welcome on startup',
    author: 'TaskForge',
    description: 'Friendly notification when you log in.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'system_startup', config: { label: 'Startup' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'TaskForge', body: 'Ready to work.', label: 'Welcome' } },
    ],
  },
  {
    id: 'tmpl_pomodoro',
    title: 'Pomodoro break nudge',
    author: 'TaskForge',
    description: 'Every 25 minutes — short break reminder (adjust cron to your focus interval).',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '*/25 * * * *', label: 'Every 25 min' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Break', body: 'Step away for 5 minutes.', label: 'Pomodoro' } },
    ],
  },
  {
    id: 'tmpl_lunch_break',
    title: 'Lunch break reminder',
    author: 'TaskForge',
    description: 'Weekdays at noon — reminder to eat and step away from the desk.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 12 * * 1-5', label: 'Noon Mon–Fri' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Lunch', body: 'Time for a break.', label: 'Lunch' } },
    ],
  },
  {
    id: 'tmpl_evening_wrap',
    title: 'End-of-day wrap-up',
    author: 'TaskForge',
    description: 'Weekdays 5:30 PM — nudge to save work and close loose ends.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '30 17 * * 1-5', label: '5:30 PM Mon–Fri' } },
      {
        node_type: 'action',
        kind: 'show_notification',
        config: { title: 'End of day', body: 'Save your work and note tomorrow’s first task.', label: 'Wrap-up' },
      },
    ],
  },
  {
    id: 'tmpl_stand_reminder',
    title: 'Stand & stretch (weekdays)',
    author: 'TaskForge',
    description: '10 AM and 2 PM on weekdays — movement reminder for desk workers.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 10,14 * * 1-5', label: '10 AM & 2 PM' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Move', body: 'Stand up, stretch, look away from the screen.', label: 'Stretch' } },
    ],
  },
  {
    id: 'tmpl_work_hours_only',
    title: 'Alerts only during work hours',
    author: 'TaskForge',
    description: 'Hourly tick, but only runs the notification between 9:00–17:00 (edit the time window).',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 * * * *', label: 'Every hour' } },
      { node_type: 'condition', kind: 'time_window', config: { start: '09:00', end: '17:00', label: 'Work hours' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Check-in', body: 'Quick status: on track?', label: 'Hourly (work hours)' } },
    ],
  },
  {
    id: 'tmpl_open_projects',
    title: 'Open Projects folder on login',
    author: 'TaskForge',
    description: 'After sign-in, opens a folder in Explorer — set path to your real projects directory.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'system_startup', config: { label: 'On login' } },
      { node_type: 'action', kind: 'open_file_folder', config: { path: 'C:\\Projects', label: 'Open Projects' } },
    ],
  },
  {
    id: 'tmpl_weekly_review',
    title: 'Weekly review (Monday morning)',
    author: 'TaskForge',
    description: 'Monday 9:00 — prompt to plan the week and clear inbox.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 9 * * 1', label: 'Monday 9 AM' } },
      {
        node_type: 'action',
        kind: 'show_notification',
        config: { title: 'Weekly review', body: 'Review goals, calendar, and inbox for the week.', label: 'Monday review' },
      },
    ],
  },
  {
    id: 'tmpl_git_friday',
    title: 'Friday ship reminder',
    author: 'TaskForge',
    description: 'Friday 4 PM — reminder to commit, push, and document before the weekend.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 16 * * 5', label: 'Friday 4 PM' } },
      {
        node_type: 'action',
        kind: 'show_notification',
        config: { title: 'Ship it', body: 'Commit, push, and update the ticket before you go.', label: 'Friday ship' },
      },
    ],
  },
  {
    id: 'tmpl_hydration',
    title: 'Hydration reminder (workdays)',
    author: 'TaskForge',
    description: 'Mid-morning and mid-afternoon on weekdays — drink water.',
    pro: false,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 10,15 * * 1-5', label: '10 AM & 3 PM' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Hydrate', body: 'Time for a glass of water.', label: 'Water' } },
    ],
  },
  {
    id: 'tmpl_wifi_at_home',
    title: 'When home Wi‑Fi connects',
    author: 'TaskForge',
    description: 'Runs when your SSID matches — set your home network name; add actions (e.g. backups).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'network_change', config: { ssid: 'MyHomeWiFi', label: 'Home network' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Network', body: 'Connected to home Wi‑Fi.', label: 'Home Wi‑Fi' } },
    ],
  },
  {
    id: 'tmpl_file_watch_folder',
    title: 'Folder change alert',
    author: 'TaskForge',
    description: 'When files change under a path — set the folder to watch (e.g. shared drive or sync folder).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'file_change', config: { path: 'C:\\Users\\Public\\Documents', label: 'Watch folder' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Files changed', body: 'Something changed in the watched folder.', label: 'File watch' } },
    ],
  },
  {
    id: 'tmpl_idle_stretch',
    title: 'After idle — stretch reminder',
    author: 'TaskForge',
    description: 'When you have been idle 30+ minutes, gentle nudge to move (adjust idle seconds).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'idle_trigger', config: { idleSeconds: 1800, label: '30 min idle' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Still there?', body: 'Take a short walk or stretch.', label: 'Idle break' } },
    ],
  },
  {
    id: 'tmpl_api_healthcheck',
    title: 'Scheduled API health check',
    author: 'TaskForge',
    description: 'GET a URL every 15 minutes — set your API or site; use logs to see failures.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '*/15 * * * *', label: 'Every 15 min' } },
      {
        node_type: 'action',
        kind: 'http_request',
        config: { method: 'GET', url: 'https://example.com/health', body: '', label: 'Health GET' },
      },
    ],
  },
  {
    id: 'tmpl_nightly_backup_copy',
    title: 'Nightly folder copy',
    author: 'TaskForge',
    description: 'Daily at 1 AM — copy a source folder to a backup path (edit paths in the builder).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 1 * * *', label: '1 AM daily' } },
      {
        node_type: 'action',
        kind: 'file_operation',
        config: {
          operation: 'copy',
          source: 'C:\\Data\\Important',
          destination: 'D:\\Backups\\Important',
          label: 'Copy folder',
        },
      },
    ],
  },
  {
    id: 'tmpl_memory_warning',
    title: 'High RAM usage alert',
    author: 'TaskForge',
    description: 'When system memory crosses your threshold — tune percentage in the trigger.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'memory_trigger', config: { threshold: 88, comparison: 'above', label: 'RAM > 88%' } },
      { node_type: 'action', kind: 'show_notification', config: { title: 'Memory', body: 'RAM usage is high — close heavy apps.', label: 'RAM alert' } },
    ],
  },
  {
    id: 'tmpl_cpu_webhook',
    title: 'CPU spike → webhook POST',
    author: 'TaskForge',
    description: 'When CPU crosses the threshold, POST JSON to your URL (Slack, Discord, PagerDuty, etc.).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'cpu_memory_usage', config: { cpuPercent: 85, memPercent: 98, label: 'CPU > 85%' } },
      {
        node_type: 'action',
        kind: 'http_request',
        config: {
          method: 'POST',
          url: 'https://hooks.example.com/alert',
          body: '{"text":"High CPU on this machine"}',
          label: 'Webhook',
        },
      },
    ],
  },
  {
    id: 'tmpl_memory_webhook',
    title: 'High RAM → webhook POST',
    author: 'TaskForge',
    description: 'Memory trigger fires, then POST a payload to an ops or chat webhook.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'memory_trigger', config: { threshold: 90, comparison: 'above', label: 'RAM > 90%' } },
      {
        node_type: 'action',
        kind: 'http_request',
        config: {
          method: 'POST',
          url: 'https://hooks.example.com/memory',
          body: '{"alert":"high_memory"}',
          label: 'Memory webhook',
        },
      },
    ],
  },
  {
    id: 'tmpl_file_change_webhook',
    title: 'Folder change → webhook',
    author: 'TaskForge',
    description: 'Any change under a watched path POSTs to your endpoint — audit configs or shared drives.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'file_change', config: { path: 'C:\\Config', label: 'Watch config' } },
      {
        node_type: 'action',
        kind: 'http_request',
        config: {
          method: 'POST',
          url: 'https://example.com/hooks/file-change',
          body: '{"source":"taskforge","event":"file_changed"}',
          label: 'Notify API',
        },
      },
    ],
  },
  {
    id: 'tmpl_office_wifi_webhook',
    title: 'Office Wi‑Fi → webhook',
    author: 'TaskForge',
    description: 'When the corporate SSID is seen, call an internal URL (check-in, VPN helper, inventory).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'network_change', config: { ssid: 'OfficeWiFi', label: 'Office SSID' } },
      {
        node_type: 'action',
        kind: 'http_request',
        config: {
          method: 'POST',
          url: 'https://intranet.example.com/api/checkin',
          body: '{}',
          label: 'Check-in POST',
        },
      },
    ],
  },
  {
    id: 'tmpl_usb_connect_notify_pro',
    title: 'USB device change (ops alert)',
    author: 'TaskForge',
    description: 'USB device count changes — pair with logs or add an HTTP step for SIEM-style alerts.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'device_trigger', config: { event: 'connect', deviceType: 'usb', label: 'USB change' } },
      {
        node_type: 'action',
        kind: 'show_notification',
        config: { title: 'USB', body: 'USB device list changed — review if unexpected.', label: 'USB alert' },
      },
    ],
  },
  {
    id: 'tmpl_sunday_maintenance_script',
    title: 'Sunday maintenance script',
    author: 'TaskForge',
    description: 'Weekly PowerShell job — point to your cleanup, defrag, or log-rotation script.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 3 * * 0', label: 'Sunday 3 AM' } },
      {
        node_type: 'action',
        kind: 'run_script',
        config: { path: 'C:\\Scripts\\maintenance.ps1', shell: 'powershell', label: 'Maintenance' },
      },
    ],
  },
  {
    id: 'tmpl_hourly_heartbeat_post',
    title: 'Hourly heartbeat POST',
    author: 'TaskForge',
    description: 'POST JSON every hour for uptime tracking or synthetic monitoring endpoints.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 * * * *', label: 'Every hour' } },
      {
        node_type: 'action',
        kind: 'http_request',
        config: {
          method: 'POST',
          url: 'https://example.com/api/heartbeat',
          body: '{"host":"this-pc","ts":"scheduled"}',
          label: 'Heartbeat',
        },
      },
    ],
  },
  {
    id: 'tmpl_idle_long_webhook',
    title: 'Long idle → away webhook',
    author: 'TaskForge',
    description: 'After 45 minutes idle, POST so calendar or presence systems know you may be away.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'idle_trigger', config: { idleSeconds: 2700, label: '45 min idle' } },
      {
        node_type: 'action',
        kind: 'http_request',
        config: {
          method: 'POST',
          url: 'https://example.com/presence/away',
          body: '{"status":"idle"}',
          label: 'Away ping',
        },
      },
    ],
  },
  {
    id: 'tmpl_deploy_window_script',
    title: 'Deploy window (scheduled script)',
    author: 'TaskForge',
    description: 'Low-traffic window — run a deploy or release script from disk (edit path and cron).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'time_schedule', config: { cron: '0 2 * * 6', label: 'Saturday 2 AM' } },
      {
        node_type: 'action',
        kind: 'run_script',
        config: { path: 'C:\\Deploy\\release.ps1', shell: 'powershell', label: 'Deploy script' },
      },
    ],
  },
  {
    id: 'tmpl_cpu_kill_placeholder',
    title: 'High CPU → kill runaway app',
    author: 'TaskForge',
    description: 'Threshold CPU then end a process by name — replace with the .exe you want to stop.',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'cpu_memory_usage', config: { cpuPercent: 95, memPercent: 99, label: 'CPU > 95%' } },
      {
        node_type: 'action',
        kind: 'kill_process',
        config: { processName: 'misbehaving-app.exe', pid: '', label: 'Kill process' },
      },
    ],
  },
  {
    id: 'tmpl_wifi_then_script',
    title: 'Home Wi‑Fi → run script',
    author: 'TaskForge',
    description: 'On home SSID match, run a sync or backup PowerShell (paths and SSID are placeholders).',
    pro: true,
    nodes: [
      { node_type: 'trigger', kind: 'network_change', config: { ssid: 'MyHomeWiFi', label: 'Home Wi‑Fi' } },
      {
        node_type: 'action',
        kind: 'run_script',
        config: { path: 'C:\\Scripts\\home-sync.ps1', shell: 'powershell', label: 'Home sync' },
      },
    ],
  },
];
