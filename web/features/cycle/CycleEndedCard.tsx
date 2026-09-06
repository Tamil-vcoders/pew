// web/features/cycle/CycleEndedCard.tsx — ports docs/prototype.jsx:1325-1352.
// "New cycle from best" is client-only (no cycle API call): it reads the best version's
// text from the page's already-loaded versions and hands it to the page's draft setter.
// "Clear" only stops rendering this card locally — the ended cycle doc itself remains a
// historical record, nothing is deleted.
import { Btn, COLORS } from "@/shared/ui";
import type { Cycle, Version } from "@/shared/types";
import { END_REASONS } from "./endReasons";

export function CycleEndedCard({
  cycle,
  promptName,
  versions,
  canEdit,
  onNewCycleFromBest,
  onClear,
}: {
  cycle: Cycle;
  promptName: string;
  versions: Version[];
  canEdit: boolean;
  onNewCycleFromBest: (text: string) => void;
  onClear: () => void;
}) {
  if (cycle.status !== "ended" || !cycle.endReason) return null;
  const reason = END_REASONS[cycle.endReason];
  const bestScore = cycle.bestN != null ? cycle.scores.find((s) => s.n === cycle.bestN)?.score : undefined;

  function newCycleFromBest() {
    if (cycle.bestN == null) return;
    const bestVersion = versions.find((v) => v.n === cycle.bestN);
    if (bestVersion) onNewCycleFromBest(bestVersion.text);
  }

  return (
    <div style={{ border: `0.5px solid ${reason.color}55`, borderRadius: 10, padding: 14, background: COLORS.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Cycle ended — {promptName}</span>
        <span
          style={{
            fontFamily: "ui-monospace, monospace", fontSize: 11, color: reason.color,
            border: `0.5px solid ${reason.color}55`, borderRadius: 5, padding: "2px 7px",
          }}
        >
          {reason.label}
        </span>
      </div>
      <div style={{ fontSize: 12.5, color: COLORS.muted, lineHeight: 1.7 }}>
        {cycle.iteration} iteration{cycle.iteration === 1 ? "" : "s"} · ${cycle.spent.toFixed(4)} spent · all
        iterations retained.
        {cycle.bestN != null && bestScore != null && (
          <>
            {" "}
            Best: <span style={{ fontFamily: "ui-monospace, monospace", color: COLORS.text }}>v{cycle.bestN}</span> at{" "}
            <span style={{ fontFamily: "ui-monospace, monospace" }}>{bestScore.toFixed(2)}</span>.
          </>
        )}
      </div>
      {canEdit && (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {cycle.endReason === "iteration-cap" && cycle.bestN != null && (
            <Btn onClick={newCycleFromBest}>New cycle from best version</Btn>
          )}
          <Btn tone="ghost" onClick={onClear}>
            Clear
          </Btn>
        </div>
      )}
    </div>
  );
}
