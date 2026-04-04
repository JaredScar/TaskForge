/** Preload/renderer detects this shape and throws `IpcCallError`. Kept free of main-process imports so sandboxed preload can load it. */
export const IPC_ERROR_FLAG = '__tfIpcErr' as const;

export type IpcErrorEnvelope = { [IPC_ERROR_FLAG]: true; code: string; message: string };

export function isIpcErrorEnvelope(v: unknown): v is IpcErrorEnvelope {
  return typeof v === 'object' && v !== null && IPC_ERROR_FLAG in v && (v as IpcErrorEnvelope)[IPC_ERROR_FLAG] === true;
}
