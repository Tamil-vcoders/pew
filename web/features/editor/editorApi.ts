// web/features/editor/editorApi.ts
import { apiFetch } from "@/shared/api/client";
import type { Version } from "@/shared/types";

export const editorApi = {
  async createVersion(
    projectId: string,
    promptId: string,
    body: { text: string; note?: string | null; technique?: string | null },
  ): Promise<Version> {
    return apiFetch<Version>(`/projects/${projectId}/prompts/${promptId}/versions`, {
      method: "POST",
      body: JSON.stringify({ text: body.text, note: body.note ?? null, technique: body.technique ?? null }),
    });
  },
};
