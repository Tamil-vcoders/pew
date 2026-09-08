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

  // nSug opts into the 3-row cycle-iteration estimate (adds a Suggestions row) for the Setup
  // tab's "Estimated spend" preview. Omit it (RunTab's one-off "Run once" preview) to get the
  // 2-row Execution + Model grading estimate -- a plain run never drafts suggestions.
  async estimate(projectId: string, promptId: string, text: string, nSug?: number): Promise<Estimate> {
    const params = new URLSearchParams({ text });
    if (nSug != null) params.set("n_sug", String(nSug));
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
