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
});
