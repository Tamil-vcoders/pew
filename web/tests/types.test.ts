// web/tests/types.test.ts
import { describe, expect, it } from "vitest";
import { CycleSchema, ProjectSchema, PromptSchema, SuggestionSchema, UserSchema, VersionSchema } from "../shared/types";

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

const BASE_CFG = {
  target: 8, maxIter: 4, budget: 0.6, nSug: 2, auto: false,
  weights: { code: 1, model: 1, human: 1 },
  models: { execution: "gemini-3.1-pro-preview", grading: "gemini-3.6-flash", suggestions: "gemini-3.6-flash", datasetGen: "gemini-3.6-flash" },
};

describe("CycleSchema", () => {
  it("parses a freshly started cycle with every nullable field null", () => {
    const parsed = CycleSchema.parse({
      id: "c1", promptId: "p1", projectId: "j1", status: "active", stage: "dataset",
      iteration: 0, spent: 0, scores: [], endReason: null, bestN: null, warnedFlat: false,
      currentVersionN: null, currentRunId: null, pending: null,
      configSnapshot: BASE_CFG, log: [], startedBy: "u1",
    });
    expect(parsed.stage).toBe("dataset");
    expect(parsed.endReason).toBeNull();
  });

  it("parses an ended cycle carrying scores, an end reason, and a best version", () => {
    const parsed = CycleSchema.parse({
      id: "c1", promptId: "p1", projectId: "j1", status: "ended", stage: "ended",
      iteration: 2, spent: 0.12, scores: [{ n: 1, score: 4.0 }, { n: 2, score: 8.5 }],
      endReason: "target-met", bestN: 2, warnedFlat: false,
      currentVersionN: 2, currentRunId: null, pending: null,
      configSnapshot: BASE_CFG, log: [{ ts: "2026-09-06T00:00:00.000Z", message: "Cycle started." }],
      startedBy: "u1",
    });
    expect(parsed.endReason).toBe("target-met");
    expect(parsed.bestN).toBe(2);
    expect(parsed.scores).toHaveLength(2);
  });

  it("parses a cycle paused at suggesting with pending candidates", () => {
    const parsed = CycleSchema.parse({
      id: "c1", promptId: "p1", projectId: "j1", status: "active", stage: "suggesting",
      iteration: 1, spent: 0.05, scores: [{ n: 1, score: 4.0 }], endReason: null, bestN: null,
      warnedFlat: false, currentVersionN: 1, currentRunId: null,
      pending: {
        candidates: [{
          ruleId: "clear", technique: "Clear and direct",
          evidence: "hedging", oldText: "a", newText: "b",
        }],
        selected: 0,
      },
      configSnapshot: BASE_CFG, log: [], startedBy: "u1",
    });
    expect(parsed.pending?.candidates).toHaveLength(1);
  });

  it("rejects an unknown stage", () => {
    expect(() =>
      CycleSchema.parse({
        id: "c1", promptId: "p1", projectId: "j1", status: "active", stage: "bogus",
        iteration: 0, spent: 0, scores: [], endReason: null, bestN: null, warnedFlat: false,
        currentVersionN: null, currentRunId: null, pending: null,
        configSnapshot: BASE_CFG, log: [], startedBy: "u1",
      }),
    ).toThrow();
  });
});
