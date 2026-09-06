// web/features/cycle/endReasons.ts — verbatim labels/colors from docs/prototype.jsx's
// END_REASONS (lines 307-314). UI-only presentation data, not part of the API contract.
import { COLORS } from "@/shared/ui";
import type { CycleEndReason } from "@/shared/types";

export const END_REASONS: Record<CycleEndReason, { label: string; color: string }> = {
  "target-met": { label: "Target met", color: COLORS.good },
  "iteration-cap": { label: "Iteration cap reached", color: COLORS.mid },
  "budget-cap": { label: "Budget cap — next iteration not started", color: COLORS.mid },
  "user-stopped": { label: "Stopped by user", color: COLORS.muted },
  "no-suggestions": { label: "No open suggestions left", color: COLORS.muted },
  "not-converging": { label: "Auto-stopped: not converging", color: COLORS.mid },
};
