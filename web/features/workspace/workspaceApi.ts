// web/features/workspace/workspaceApi.ts
import { apiFetch } from "@/shared/api/client";
import type { Project, Prompt } from "@/shared/types";

export const workspaceApi = {
  async createProject(name: string): Promise<Project> {
    return apiFetch<Project>("/projects", { method: "POST", body: JSON.stringify({ name }) });
  },

  async renameProject(projectId: string, name: string): Promise<Project> {
    return apiFetch<Project>(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async createPrompt(projectId: string, name: string, tags: string[]): Promise<Prompt> {
    return apiFetch<Prompt>(`/projects/${projectId}/prompts`, {
      method: "POST",
      body: JSON.stringify({ name, tags }),
    });
  },

  async updatePrompt(
    projectId: string,
    promptId: string,
    patch: Partial<Pick<Prompt, "name" | "tags" | "archived">>,
  ): Promise<Prompt> {
    return apiFetch<Prompt>(`/projects/${projectId}/prompts/${promptId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  },
};
