// web/features/cycle/CycleLog.tsx — ports docs/prototype.jsx:1430-1437's monospace
// scrollback list (same rendering pattern as DatasetTab's genLog).
import { COLORS } from "@/shared/ui";
import type { CycleLogEntry } from "@/shared/types";

export function CycleLog({ log }: { log: CycleLogEntry[] }) {
  if (log.length === 0) return null;
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 6 }}>Cycle log</div>
      <div
        style={{
          fontFamily: "ui-monospace, monospace", fontSize: 11, lineHeight: 1.8, color: COLORS.muted,
          background: "#0F1116", border: `0.5px solid ${COLORS.border}`, borderRadius: 8,
          padding: "8px 12px", maxHeight: 150, overflow: "auto",
        }}
      >
        {log.map((entry, i) => (
          <div key={i}>{entry.message}</div>
        ))}
      </div>
    </div>
  );
}
