// web/features/runs/runsApi.ts
import { apiFetch } from "@/shared/api/client";
import type { Estimate } from "@/shared/types";

export const runsApi = {
  async start(projectId: string, promptId: string, text: string): Promise<{ runId: string; versionN: number }> {
    return apiFetch(`/projects/${projectId}/prompts/${promptId}/runs`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  async estimate(projectId: string, promptId: string, text: string): Promise<Estimate> {
    const params = new URLSearchParams({ text });
    return apiFetch<Estimate>(`/projects/${projectId}/prompts/${promptId}/runs/estimate?${params.toString()}`);
  },

  async setHumanGrade(
    projectId: string,
    promptId: string,
    runId: string,
    caseId: string,
    score: number | null,
  ): Promise<void> {
    await apiFetch(`/projects/${projectId}/prompts/${promptId}/runs/${runId}/cases/${caseId}/human-grade`, {
      method: "PUT",
      body: JSON.stringify({ score }),
    });
  },
};
