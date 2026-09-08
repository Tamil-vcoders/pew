// web/tests/last-prompt.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { forgetLastPrompt, readLastPrompt, rememberLastPrompt } from "../features/workspace/lastPrompt";

beforeEach(() => localStorage.clear());

describe("lastPrompt", () => {
  it("returns null when nothing has been remembered for the user", () => {
    expect(readLastPrompt("u1")).toBeNull();
  });

  it("round-trips the last opened prompt per user", () => {
    rememberLastPrompt("u1", "j1", "p1");
    rememberLastPrompt("u2", "j9", "p9");
    expect(readLastPrompt("u1")).toEqual({ projectId: "j1", promptId: "p1" });
    expect(readLastPrompt("u2")).toEqual({ projectId: "j9", promptId: "p9" });
  });

  it("forgets the remembered prompt", () => {
    rememberLastPrompt("u1", "j1", "p1");
    forgetLastPrompt("u1");
    expect(readLastPrompt("u1")).toBeNull();
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem("pew:lastPrompt:u1", "{not json");
    expect(readLastPrompt("u1")).toBeNull();
  });
});
