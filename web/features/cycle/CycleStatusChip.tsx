// web/features/cycle/CycleStatusChip.tsx — always-visible header chip (AC-9.6: cumulative
// spend, iterations used, and score-by-iteration visible without leaving the screen).
// Ports docs/prototype.jsx:1112-1119. Rendered once in web/app/(workspace)/layout.tsx.
"use client";
import { useState } from "react";
import { useAuth } from "@/features/auth/useAuth";
import { usePromptDoc } from "@/features/workspace";
import { Btn, COLORS } from "@/shared/ui";
import { capabilitiesFor } from "@/shared/rbac/permissions";
import { cycleApi } from "./cycleApi";
import { useCycle } from "./useCycle";

export function CycleStatusChip() {
  const { profile } = useAuth();
  const can = capabilitiesFor(profile?.role ?? null);
  const { data: cycle } = useCycle();
  const { data: prompt } = usePromptDoc(cycle?.projectId ?? "", cycle?.promptId ?? "");
  const [stopping, setStopping] = useState(false);

  if (!cycle || cycle.status !== "active") return null;

  async function stop() {
    if (!cycle) return;
    setStopping(true);
    try {
      await cycleApi.stop(cycle.id);
    } finally {
      setStopping(false);
    }
  }

  const scoreTrail = cycle.scores.length > 0 ? ` · ${cycle.scores.map((s) => s.score.toFixed(1)).join(" → ")}` : "";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        border: `0.5px solid ${COLORS.border}`, borderRadius: 6, padding: "4px 8px",
      }}
    >
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, color: COLORS.muted }}>
        {prompt?.name ?? "…"} · iter {cycle.iteration}/{cycle.configSnapshot.maxIter} · $
        {cycle.spent.toFixed(2)}/${cycle.configSnapshot.budget.toFixed(2)}
        {scoreTrail}
      </span>
      {can.edit && (
        <Btn tone="danger" small disabled={stopping} onClick={stop}>
          Stop
        </Btn>
      )}
    </div>
  );
}
