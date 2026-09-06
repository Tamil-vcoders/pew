// Local copy of workspace's onSnapshot StreamResult shape (see
// web/features/workspace/streamTypes.ts) — features don't import each other's internals.
export interface StreamResult<T> {
  data: T;
  error: Error | null;
}

export function toError(err: unknown, fallbackMessage: string): Error {
  return err instanceof Error ? err : new Error(fallbackMessage);
}
