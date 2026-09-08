// web/features/runs/EstimateTable.tsx — port of docs/prototype.jsx:416-437.
import { COLORS } from "@/shared/ui";
import type { Estimate } from "@/shared/types";

export const fmt$ = (v: number) => "$" + v.toFixed(3);
export const fmtK = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + "k" : String(v));
const GRID = "1.4fr 1fr .8fr .8fr .7fr";

export function EstimateTable({ estimate }: { estimate: Estimate }) {
  // A Suggestions row only ever appears in the 3-row cycle-iteration estimate (opted into via
  // runsApi.estimate's nSug param) -- a plain "Run once" never drafts suggestions, so "Per
  // run" only fits the 2-row shape.
  const isCycleEstimate = estimate.rows.some((r) => r.stage === "Suggestions");
  return (
    <div style={{ border: `0.5px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div
        style={{
          display: "grid", gridTemplateColumns: GRID, fontSize: 10.5, color: COLORS.faint,
          padding: "6px 10px", background: COLORS.surface2,
        }}
      >
        <span>stage</span>
        <span>model</span>
        <span>tokens in</span>
        <span>tokens out</span>
        <span style={{ textAlign: "right" }}>est. $</span>
      </div>
      {estimate.rows.map((r) => (
        <div
          key={r.stage}
          style={{
            display: "grid", gridTemplateColumns: GRID, fontSize: 11.5, color: COLORS.muted,
            padding: "6px 10px", borderTop: `0.5px solid ${COLORS.border}55`,
            fontFamily: "ui-monospace, monospace",
          }}
        >
          <span style={{ fontFamily: "Inter, sans-serif" }}>{r.stage}</span>
          <span>{r.model}</span>
          <span>{fmtK(r.tokensIn)}</span>
          <span>{fmtK(r.tokensOut)}</span>
          <span style={{ textAlign: "right" }}>{fmt$(r.cost)}</span>
        </div>
      ))}
      <div
        style={{
          display: "grid", gridTemplateColumns: GRID, fontSize: 11.5, color: COLORS.text,
          padding: "6px 10px", borderTop: `0.5px solid ${COLORS.border}`, background: COLORS.surface2,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        <span style={{ fontFamily: "Inter, sans-serif" }}>
          {isCycleEstimate ? "Per iteration" : "Per run"} ({estimate.nCases} cases)
        </span>
        <span>—</span>
        <span>{fmtK(estimate.totalIn)}</span>
        <span>{fmtK(estimate.totalOut)}</span>
        <span style={{ textAlign: "right" }}>{fmt$(estimate.totalCost)}</span>
      </div>
    </div>
  );
}
