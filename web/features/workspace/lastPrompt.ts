// web/features/workspace/lastPrompt.ts — remembers the prompt a user last opened so the
// dashboard route ("/") can land back on it (e.g. after a trip to Global settings) instead
// of the empty "select a prompt" state. Per-user key so two accounts sharing a browser don't
// bounce into each other's prompt. localStorage access is wrapped: private windows, cleared
// site data, or SSR can all make it throw or come back empty, and the page must still work.

export type LastPrompt = { projectId: string; promptId: string };

const key = (uid: string) => `pew:lastPrompt:${uid}`;

export function rememberLastPrompt(uid: string, projectId: string, promptId: string): void {
  try {
    localStorage.setItem(key(uid), JSON.stringify({ projectId, promptId } satisfies LastPrompt));
  } catch {
    // best-effort convenience only
  }
}

export function readLastPrompt(uid: string): LastPrompt | null {
  try {
    const raw = localStorage.getItem(key(uid));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as LastPrompt).projectId === "string" &&
      typeof (parsed as LastPrompt).promptId === "string"
    ) {
      return { projectId: (parsed as LastPrompt).projectId, promptId: (parsed as LastPrompt).promptId };
    }
    return null;
  } catch {
    return null;
  }
}

export function forgetLastPrompt(uid: string): void {
  try {
    localStorage.removeItem(key(uid));
  } catch {
    // nothing to forget
  }
}
