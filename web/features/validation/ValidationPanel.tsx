"use client";
import { COLORS } from "@/shared/ui/tokens";
import type { ValidationResult } from "./rules";

function StatusGlyph({ status }: { status: ValidationResult["status"] }) {
  if (status === "pass") return <span style={{ color: COLORS.good }}>✓</span>;
  if (status === "fail") return <span style={{ color: COLORS.bad }}>✕</span>;
  return <span style={{ color: COLORS.faint }}>–</span>;
}

export function ValidationPanel({ results }: { results: ValidationResult[] }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted }}>Static validation</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: COLORS.faint }}>
          0 model calls · live
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {results.map((r) => (
          <div
            key={r.id}
            style={{ display: "flex", gap: 9, padding: "7px 8px", borderRadius: 6, background: COLORS.surface }}
          >
            <div style={{ marginTop: 1 }}>
              <StatusGlyph status={r.status} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{r.name}</div>
              <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 1 }}>{r.reason}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: COLORS.faint, marginTop: 8 }}>
        Advisory only — static catalogue rules, never a model.
      </div>
    </div>
  );
}
