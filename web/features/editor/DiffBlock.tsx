"use client";
import { useMemo } from "react";
import { COLORS } from "@/shared/ui/tokens";

export type DiffLine = { t: "same" | "add" | "del"; v: string };

export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split("\n");
  const B = b.split("\n");
  const n = A.length;
  const m = B.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      out.push({ t: "same", v: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ t: "del", v: A[i] });
      i++;
    } else {
      out.push({ t: "add", v: B[j] });
      j++;
    }
  }
  while (i < n) {
    out.push({ t: "del", v: A[i] });
    i++;
  }
  while (j < m) {
    out.push({ t: "add", v: B[j] });
    j++;
  }
  return out;
}

export function DiffBlock({
  oldText,
  newText,
  maxHeight = 200,
}: {
  oldText: string;
  newText: string;
  maxHeight?: number;
}) {
  const lines = useMemo(() => diffLines(oldText, newText), [oldText, newText]);
  return (
    <div
      style={{
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        lineHeight: 1.65,
        background: "#0F1116",
        border: `0.5px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: "8px 0",
        maxHeight,
        overflow: "auto",
      }}
    >
      {lines.map((l, idx) => (
        <div
          key={idx}
          style={{
            padding: "1px 12px",
            whiteSpace: "pre-wrap",
            background: l.t === "add" ? "#6FBF8B14" : l.t === "del" ? "#DB6B5A14" : "transparent",
            color: l.t === "add" ? COLORS.good : l.t === "del" ? COLORS.bad : COLORS.muted,
            borderLeft: `2px solid ${l.t === "add" ? COLORS.good : l.t === "del" ? COLORS.bad : "transparent"}`,
          }}
        >
          <span style={{ opacity: 0.55, marginRight: 8 }}>{l.t === "add" ? "+" : l.t === "del" ? "−" : " "}</span>
          {l.v || " "}
        </div>
      ))}
    </div>
  );
}
