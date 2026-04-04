import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { EntitlementRequiredError } from './entitlement';
import { IPC_ERROR_FLAG, type IpcErrorEnvelope } from './ipc-error-envelope';

export { IPC_ERROR_FLAG, type IpcErrorEnvelope, isIpcErrorEnvelope } from './ipc-error-envelope';

/** Wraps invoke handlers so thrown errors become a structured envelope (never crashes the channel). */
export function ipcHandle<TArgs extends unknown[], TRet>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: TArgs) => TRet | Promise<TRet>
): void {
  ipcMain.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    try {
      return await handler(event, ...(args as TArgs));
    } catch (e) {
      if (e instanceof EntitlementRequiredError) {
        return { [IPC_ERROR_FLAG]: true, code: e.code, message: e.message } satisfies IpcErrorEnvelope;
      }
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ipc ${channel}]`, e);
      return { [IPC_ERROR_FLAG]: true, code: 'INTERNAL', message: msg } satisfies IpcErrorEnvelope;
    }
  });
}
