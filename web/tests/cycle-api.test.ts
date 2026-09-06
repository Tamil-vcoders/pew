import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/shared/api/client";
import { cycleApi } from "../features/cycle/cycleApi";

describe("cycleApi", () => {
  it("start POSTs projectId/promptId to /cycles", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await cycleApi.start("j1", "p1");
    expect(apiFetch).toHaveBeenCalledWith("/cycles", {
      method: "POST",
      body: JSON.stringify({ projectId: "j1", promptId: "p1" }),
    });
  });

  it("approveDataset POSTs with no body", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await cycleApi.approveDataset("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cycles/c1/approve-dataset", { method: "POST" });
  });

  it("confirmIteration POSTs the draft text", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await cycleApi.confirmIteration("c1", "Summarize: {{ticket_text}}");
    expect(apiFetch).toHaveBeenCalledWith("/cycles/c1/confirm-iteration", {
      method: "POST",
      body: JSON.stringify({ text: "Summarize: {{ticket_text}}" }),
    });
  });

  it("continueCycle POSTs with no body", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await cycleApi.continueCycle("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cycles/c1/continue", { method: "POST" });
  });

  it("selectCandidate POSTs the chosen index with a null overrideText by default", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await cycleApi.selectCandidate("c1", 0);
    expect(apiFetch).toHaveBeenCalledWith("/cycles/c1/select-candidate", {
      method: "POST",
      body: JSON.stringify({ index: 0, overrideText: null }),
    });
  });

  it("selectCandidate carries an overrideText when the user continues with their own edits", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await cycleApi.selectCandidate("c1", 1, "my edited prompt");
    expect(apiFetch).toHaveBeenCalledWith("/cycles/c1/select-candidate", {
      method: "POST",
      body: JSON.stringify({ index: 1, overrideText: "my edited prompt" }),
    });
  });

  it("stop POSTs with no body", async () => {
    vi.mocked(apiFetch).mockResolvedValue({});
    await cycleApi.stop("c1");
    expect(apiFetch).toHaveBeenCalledWith("/cycles/c1/stop", { method: "POST" });
  });
});
