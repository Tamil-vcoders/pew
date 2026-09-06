import { describe, expect, it } from "vitest";
import { blendCase, blendRun } from "../features/runs/blend";
import type { CaseResult } from "../shared/types";

const EQUAL_WEIGHTS = { code: 1, model: 1, human: 1 };

function done(caseId: string, code: number, model: number, humanScore: number | null = null): CaseResult {
  return {
    index: 0, caseId, output: "x", codeScore: code, modelScore: model, humanScore,
    weakness: null, reasoning: "r", tokensIn: 1, tokensOut: 1, status: "done", error: null,
  };
}

function errored(caseId: string): CaseResult {
  return {
    index: 0, caseId, output: null, codeScore: null, modelScore: null, humanScore: null,
    weakness: null, reasoning: null, tokensIn: 0, tokensOut: 0, status: "error", error: "boom",
  };
}

describe("blendCase", () => {
  it("averages code and model when ungraded", () => {
    expect(blendCase(10, 6, null, EQUAL_WEIGHTS)).toBe(8);
  });

  it("includes human only when graded", () => {
    expect(blendCase(10, 6, 8, EQUAL_WEIGHTS)).toBe(8);
  });

  it("returns 0 rather than dividing by zero when every weight is 0", () => {
    expect(blendCase(10, 6, 8, { code: 0, model: 0, human: 0 })).toBe(0);
  });
});

describe("blendRun", () => {
  it("blends code and model only when nothing is human-graded", () => {
    const stats = blendRun([done("c1", 10, 6), done("c2", 8, 8)], EQUAL_WEIGHTS);
    expect(stats.humanCount).toBe(0);
    expect(stats.caseCount).toBe(2);
    expect(stats.composite).toBe(8);
  });

  it("counts only the cases that were actually graded under partial grading", () => {
    const stats = blendRun([done("c1", 10, 6, 8), done("c2", 8, 8)], EQUAL_WEIGHTS);
    expect(stats.humanCount).toBe(1);
    expect(stats.caseCount).toBe(2);
  });

  it("excludes error cases from every average instead of scoring them zero", () => {
    const stats = blendRun([done("c1", 10, 10), errored("c2")], EQUAL_WEIGHTS);
    expect(stats.errorCount).toBe(1);
    expect(stats.composite).toBe(10);
    expect(stats.codeAvg).toBe(10);
  });

  it("returns a null composite rather than zero when every case errored", () => {
    const stats = blendRun([errored("c1"), errored("c2")], EQUAL_WEIGHTS);
    expect(stats.composite).toBeNull();
    expect(stats.codeAvg).toBeNull();
    expect(stats.errorCount).toBe(2);
  });
});
