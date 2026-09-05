// web/tests/types.test.ts
import { describe, expect, it } from "vitest";
import { ProjectSchema, PromptSchema, SuggestionSchema, UserSchema, VersionSchema } from "../shared/types";

describe("UserSchema", () => {
  it("parses a /me response", () => {
    const parsed = UserSchema.parse({
      uid: "u1", email: "a@b.com", name: "A", role: "administrator", createdAt: "2026-09-05T00:00:00Z",
    });
    expect(parsed.role).toBe("administrator");
  });

  it("rejects an unknown role", () => {
    expect(() =>
      UserSchema.parse({ uid: "u1", email: "a@b.com", name: "A", role: "superuser", createdAt: "x" }),
    ).toThrow();
  });
});

describe("ProjectSchema", () => {
  it("parses a project response including nested cfg", () => {
    const parsed = ProjectSchema.parse({
      id: "j1", name: "Support automation",
      cfg: {
        target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
        weights: { code: 1, model: 1, human: 1 },
        models: { execution: "gemini-2.5-pro", grading: "gemini-2.5-flash", suggestions: "gemini-2.5-flash", datasetGen: "gemini-2.5-flash" },
      },
    });
    expect(parsed.name).toBe("Support automation");
  });
});

describe("PromptSchema", () => {
  it("parses a prompt response with a null bestScore", () => {
    const parsed = PromptSchema.parse({
      id: "p1", projectId: "j1", name: "Ticket triage", tags: ["triage", "prod"],
      archived: false, bestScore: null, latestVersion: 1,
    });
    expect(parsed.bestScore).toBeNull();
    expect(parsed.tags).toEqual(["triage", "prod"]);
  });
});

describe("VersionSchema", () => {
  it("parses a version with a null note/technique/createdAt", () => {
    const parsed = VersionSchema.parse({
      n: 1, text: "Summarize the ticket.", note: null, technique: null,
      createdBy: "u1", createdAt: null,
    });
    expect(parsed.n).toBe(1);
  });

  it("parses a version carrying a technique", () => {
    const parsed = VersionSchema.parse({
      n: 2, text: "v2", note: "Applied: Clear and direct", technique: "Clear and direct",
      createdBy: "u1", createdAt: "2026-09-06T00:00:00.000Z",
    });
    expect(parsed.technique).toBe("Clear and direct");
  });
});

describe("SuggestionSchema", () => {
  it("parses a suggestion", () => {
    const parsed = SuggestionSchema.parse({
      ruleId: "clear", technique: "Clear and direct",
      evidence: 'Hedging language ("try to") leaves the task underspecified.',
      oldText: "Try to help.", newText: "Help.",
    });
    expect(parsed.ruleId).toBe("clear");
  });
});
