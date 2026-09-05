import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/api/client", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/shared/api/client";
import { editorApi } from "../features/editor/editorApi";

describe("editorApi.createVersion", () => {
  it("POSTs to .../versions with the given text/note/technique", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ n: 2 });
    await editorApi.createVersion("j1", "p1", { text: "v2", note: "Applied: Clear and direct", technique: "Clear and direct" });
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/versions", {
      method: "POST",
      body: JSON.stringify({ text: "v2", note: "Applied: Clear and direct", technique: "Clear and direct" }),
    });
  });

  it("defaults note/technique to null when omitted", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ n: 1 });
    await editorApi.createVersion("j1", "p1", { text: "v1" });
    expect(apiFetch).toHaveBeenCalledWith("/projects/j1/prompts/p1/versions", {
      method: "POST",
      body: JSON.stringify({ text: "v1", note: null, technique: null }),
    });
  });
});
