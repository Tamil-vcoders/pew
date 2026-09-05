// web/features/editor/streamTypes.ts
// Local copy of workspace's onSnapshot StreamResult shape (see
// web/features/workspace/streamTypes.ts) — features don't import each other's internals,
// and this is a 2-function generic utility, not shared business logic, so duplicating it
// here is cheaper than promoting it to a shared module just for two callers.
export interface StreamResult<T> {
  data: T;
  error: Error | null;
}

export function toError(err: unknown, fallbackMessage: string): Error {
  return err instanceof Error ? err : new Error(fallbackMessage);
}
