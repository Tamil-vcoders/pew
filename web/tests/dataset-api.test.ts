import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/shared/api/client";
import { datasetApi } from "../features/dataset/datasetApi";

describe("datasetApi", () => {
  it("create POSTs input/expected to .../dataset", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "c1" });
    await datasetApi.create("j1", "p1", "ticket text", "high");
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/dataset", {
      method: "POST",
      body: JSON.stringify({ input: "ticket text", expected: "high" }),
    });
  });

  it("update PATCHes only the given fields", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ id: "c1" });
    await datasetApi.update("j1", "p1", "c1", { expected: "critical" });
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/dataset/c1", {
      method: "PATCH",
      body: JSON.stringify({ expected: "critical" }),
    });
  });

  it("remove DELETEs the case", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    await datasetApi.remove("j1", "p1", "c1");
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/dataset/c1", { method: "DELETE" });
  });

  it("generate defaults n to 3", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ cases: [], cost: 0, model: "gemini-2.5-flash" });
    await datasetApi.generate("j1", "p1", "Summarize: {{ticket_text}}");
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/dataset/generate", {
      method: "POST",
      body: JSON.stringify({ text: "Summarize: {{ticket_text}}", n: 3 }),
    });
  });
});
