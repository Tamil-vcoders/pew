// web/features/runs/blend.ts
// Client-side mirror of api/app/domain/scoring.py's blend_case/blend_run — display only,
// the same pattern as features/validation/rules.ts mirrors domain/validation.py. Needed so
// a manual grade updates the visible composite immediately without a server round trip;
// the server's stored run.composite (from the run's original execution) never changes.
import type { CaseResult } from "@/shared/types";

export interface Weights {
  code: number;
  model: number;
  human: number;
}

export function blendCase(code: number, model: number, human: number | null, weights: Weights): number {
  const parts: [number, number][] = [
    [weights.code, code],
    [weights.model, model],
  ];
  if (human != null) parts.push([weights.human, human]);
  const denom = parts.reduce((sum, [w]) => sum + w, 0);
  if (denom === 0) return 0;
  return parts.reduce((sum, [w, v]) => sum + w * v, 0) / denom;
}

export interface RunStats {
  composite: number | null;
  codeAvg: number | null;
  modelAvg: number | null;
  humanCount: number;
  caseCount: number;
  errorCount: number;
}

export function blendRun(cases: CaseResult[], weights: Weights): RunStats {
  const scorable = cases.filter((c) => c.status === "done");
  const errorCount = cases.length - scorable.length;
  const humanCount = scorable.filter((c) => c.humanScore != null).length;

  if (scorable.length === 0) {
    return { composite: null, codeAvg: null, modelAvg: null, humanCount, caseCount: cases.length, errorCount };
  }
  const blended = scorable.map((c) => blendCase(c.codeScore ?? 0, c.modelScore ?? 0, c.humanScore, weights));
  return {
    composite: blended.reduce((s, v) => s + v, 0) / blended.length,
    codeAvg: scorable.reduce((s, c) => s + (c.codeScore ?? 0), 0) / scorable.length,
    modelAvg: scorable.reduce((s, c) => s + (c.modelScore ?? 0), 0) / scorable.length,
    humanCount,
    caseCount: cases.length,
    errorCount,
  };
}
