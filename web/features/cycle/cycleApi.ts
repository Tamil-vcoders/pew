// web/features/cycle/cycleApi.ts
import { apiFetch } from "@/shared/api/client";
import type { Cycle } from "@/shared/types";

export const cycleApi = {
  async start(projectId: string, promptId: string): Promise<Cycle> {
    return apiFetch<Cycle>("/cycles", {
      method: "POST",
      body: JSON.stringify({ projectId, promptId }),
    });
  },

  async approveDataset(cycleId: string): Promise<Cycle> {
    return apiFetch<Cycle>(`/cycles/${cycleId}/approve-dataset`, { method: "POST" });
  },

  async confirmIteration(cycleId: string, text: string): Promise<Cycle> {
    return apiFetch<Cycle>(`/cycles/${cycleId}/confirm-iteration`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  async continueCycle(cycleId: string): Promise<Cycle> {
    return apiFetch<Cycle>(`/cycles/${cycleId}/continue`, { method: "POST" });
  },

  async selectCandidate(cycleId: string, index: number, overrideText?: string): Promise<Cycle> {
    return apiFetch<Cycle>(`/cycles/${cycleId}/select-candidate`, {
      method: "POST",
      body: JSON.stringify({ index, overrideText: overrideText ?? null }),
    });
  },

  async stop(cycleId: string): Promise<Cycle> {
    return apiFetch<Cycle>(`/cycles/${cycleId}/stop`, { method: "POST" });
  },
};
