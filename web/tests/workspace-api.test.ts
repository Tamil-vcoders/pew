// web/tests/workspace-api.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/api/client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "../shared/api/client";
import { workspaceApi } from "../features/workspace/workspaceApi";

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe("workspaceApi", () => {
  it("createProject posts to /projects", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "j1" });
    await workspaceApi.createProject("New project");
    expect(apiFetch).toHaveBeenCalledWith("/projects", {
      method: "POST",
      body: JSON.stringify({ name: "New project" }),
    });
  });

  it("createPrompt posts to /projects/{id}/prompts with tags", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "p1" });
    await workspaceApi.createPrompt("j1", "New prompt", ["draft"]);
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts", {
      method: "POST",
      body: JSON.stringify({ name: "New prompt", tags: ["draft"] }),
    });
  });

  it("updatePrompt patches only the given fields", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "p1" });
    await workspaceApi.updatePrompt("j1", "p1", { archived: true });
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1", {
      method: "PATCH",
      body: JSON.stringify({ archived: true }),
    });
  });

  it("updateCfg patches every cfg field (no name) to /projects/{id}", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "j1" });
    const cfg = {
      target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
      weights: { code: 1, model: 1, human: 1 },
      models: { execution: "m1", grading: "m2", suggestions: "m2", datasetGen: "m2" },
    };
    await workspaceApi.updateCfg("j1", cfg);
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1", {
      method: "PATCH",
      body: JSON.stringify({
        target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
        weights: { code: 1, model: 1, human: 1 },
        models: { execution: "m1", grading: "m2", suggestions: "m2", datasetGen: "m2" },
      }),
    });
  });
});
