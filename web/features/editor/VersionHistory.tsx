// web/features/editor/VersionHistory.tsx
"use client";
import { COLORS, ScoreBadge } from "@/shared/ui";
import type { Version } from "@/shared/types";

export function VersionHistory({
  versions,
  currentVersionN,
  scoreByVersion = {},
}: {
  versions: Version[];
  currentVersionN: number;
  scoreByVersion?: Record<number, number>;
}) {
  if (versions.length <= 1) return null;
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: COLORS.muted, marginBottom: 8 }}>Version history</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {versions.map((v) => (
          <div
            key={v.n}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "6px 8px", borderRadius: 6,
              background: v.n === currentVersionN ? COLORS.accentDim : "transparent",
            }}
          >
            <div style={{ fontSize: 11.5, color: COLORS.muted }}>
              <span style={{ fontFamily: "ui-monospace, monospace", color: COLORS.text }}>v{v.n}</span>
              {v.note ? ` · ${v.note}` : ""}
              {v.technique && (
                <span style={{ marginLeft: 6, fontSize: 10, color: COLORS.accent }}>({v.technique})</span>
              )}
            </div>
            {scoreByVersion[v.n] != null && <ScoreBadge value={scoreByVersion[v.n]} />}
          </div>
        ))}
      </div>
    </div>
  );
}
