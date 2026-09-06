// web/features/dataset/datasetApi.ts
import { apiFetch } from "@/shared/api/client";
import type { Case } from "@/shared/types";

export interface GenerateResult {
  cases: Case[];
  cost: number;
  model: string;
}

export const datasetApi = {
  async create(projectId: string, promptId: string, input: string, expected: string): Promise<Case> {
    return apiFetch<Case>(`/projects/${projectId}/prompts/${promptId}/dataset`, {
      method: "POST",
      body: JSON.stringify({ input, expected }),
    });
  },

  async update(
    projectId: string,
    promptId: string,
    caseId: string,
    patch: Partial<Pick<Case, "input" | "expected">>,
  ): Promise<Case> {
    return apiFetch<Case>(`/projects/${projectId}/prompts/${promptId}/dataset/${caseId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },

  async remove(projectId: string, promptId: string, caseId: string): Promise<void> {
    await apiFetch<void>(`/projects/${projectId}/prompts/${promptId}/dataset/${caseId}`, {
      method: "DELETE",
    });
  },

  async generate(projectId: string, promptId: string, text: string, n = 3): Promise<GenerateResult> {
    return apiFetch<GenerateResult>(`/projects/${projectId}/prompts/${promptId}/dataset/generate`, {
      method: "POST",
      body: JSON.stringify({ text, n }),
    });
  },
};
