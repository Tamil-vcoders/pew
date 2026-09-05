// web/tests/suggestions-api.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/shared/api/client";
import { suggestionsApi } from "../features/suggestions/suggestionsApi";

describe("suggestionsApi.generate", () => {
  it("POSTs the draft text to .../suggestions", async () => {
    vi.mocked(apiFetch).mockResolvedValue([]);
    await suggestionsApi.generate("j1", "p1", "Try to help.");
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/suggestions", {
      method: "POST",
      body: JSON.stringify({ text: "Try to help." }),
    });
  });
});
