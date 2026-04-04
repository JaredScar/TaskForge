import { Notification } from 'electron';

export function runShowNotification(config: Record<string, unknown>): void {
  const title = String(config['title'] ?? 'TaskForge');
  const body = String(config['body'] ?? 'Workflow notification');
  if (!Notification.isSupported()) {
    throw new Error(
      'Desktop notifications are not available (enable system notifications or use a packaged install with App User Model ID on Windows).'
    );
  }
  new Notification({ title, body }).show();
}
