/** Thrown by preload when main returns `__tfIpcErr` (see `electron/ipc-error-envelope.ts`). PLAN §19.2 */
export class TaskForgeIpcError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'TaskForgeIpcError';
  }
}

export function isTaskForgeIpcError(e: unknown): e is TaskForgeIpcError {
  return e instanceof TaskForgeIpcError;
}

/** Detects errors raised from sandboxed preload (`Error` with `name` + `code`). */
export function isTaskForgeIpcFailure(e: unknown): e is Error & { code: string } {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as Error & { code?: string };
  return err.name === 'TaskForgeIpcError' && typeof err.code === 'string';
}
