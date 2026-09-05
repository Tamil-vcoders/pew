// web/features/workspace/streamTypes.ts
// Shared return shape for this feature's onSnapshot-backed hooks (useProjectsStream,
// usePromptsStream, usePromptDoc), so all three surface a listener failure — a
// Firestore-level error (e.g. permission-denied) or a schema-parse failure inside the
// success callback — the same way, and consuming components stay consistent.
export interface StreamResult<T> {
  data: T;
  error: Error | null;
}

export function toError(err: unknown, fallbackMessage: string): Error {
  return err instanceof Error ? err : new Error(fallbackMessage);
}
