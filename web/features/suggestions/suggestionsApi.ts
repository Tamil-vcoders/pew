// web/features/suggestions/suggestionsApi.ts
import { apiFetch } from "@/shared/api/client";
import type { Suggestion } from "@/shared/types";

export const suggestionsApi = {
  async generate(projectId: string, promptId: string, text: string): Promise<Suggestion[]> {
    return apiFetch<Suggestion[]>(`/projects/${projectId}/prompts/${promptId}/suggestions`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },
};
