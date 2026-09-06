import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/shared/api/client";
import { runsApi } from "../features/runs/runsApi";

describe("runsApi", () => {
  it("start POSTs the draft text to .../runs", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ runId: "r1", versionN: 2 });
    await runsApi.start("j1", "p1", "Summarize: {{ticket_text}}");
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/runs", {
      method: "POST",
      body: JSON.stringify({ text: "Summarize: {{ticket_text}}" }),
    });
  });

  it("estimate GETs .../runs/estimate with the text as a query param", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ rows: [], totalIn: 0, totalOut: 0, totalCost: 0, nCases: 0 });
    await runsApi.estimate("j1", "p1", "hello world");
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/runs/estimate?text=hello+world");
  });

  it("setHumanGrade PUTs the score to the case's human-grade endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    await runsApi.setHumanGrade("j1", "p1", "r1", "c1", 8.5);
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/runs/r1/cases/c1/human-grade", {
      method: "PUT",
      body: JSON.stringify({ score: 8.5 }),
    });
  });

  it("setHumanGrade clears the grade by sending a null score", async () => {
    vi.mocked(apiFetch).mockResolvedValue(undefined);
    await runsApi.setHumanGrade("j1", "p1", "r1", "c1", null);
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/runs/r1/cases/c1/human-grade", {
      method: "PUT",
      body: JSON.stringify({ score: null }),
    });
  });
});
