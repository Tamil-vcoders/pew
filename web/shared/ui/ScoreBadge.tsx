// web/shared/ui/ScoreBadge.tsx
// Ported from docs/prototype.jsx's ScoreBadge/scoreColor/scoreDim (lines 33-34, 322-330).
import { COLORS } from "./tokens";

function scoreColor(value: number): string {
  return value >= 7 ? COLORS.good : value >= 4 ? COLORS.mid : COLORS.bad;
}
function scoreDim(value: number): string {
  return value >= 7 ? COLORS.goodDim : value >= 4 ? COLORS.midDim : COLORS.badDim;
}

export function ScoreBadge({ value }: { value: number }) {
  const color = scoreColor(value);
  return (
    <span
      style={{
        fontFamily: "ui-monospace, monospace",
        color,
        background: scoreDim(value),
        border: `0.5px solid ${color}55`,
        borderRadius: 6,
        padding: "1px 7px",
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {value.toFixed(1)}
    </span>
  );
}
