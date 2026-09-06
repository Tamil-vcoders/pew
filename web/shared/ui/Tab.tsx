// web/shared/ui/Tab.tsx — port of docs/prototype.jsx:338-356.
"use client";
import type { ReactNode } from "react";
import { COLORS } from "./tokens";

export function Tab({
  active,
  onClick,
  children,
  count,
  dot,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  dot?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: active ? `2px solid ${COLORS.accent}` : "2px solid transparent",
        color: active ? COLORS.text : COLORS.muted,
        padding: "10px 4px",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {children}
      {dot && <span style={{ width: 7, height: 7, borderRadius: 4, background: COLORS.accent }} />}
      {count != null && (
        <span
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 11,
            color: active ? COLORS.accent : COLORS.faint,
            background: active ? COLORS.accentDim : "#2E323C60",
            borderRadius: 10,
            padding: "1px 6px",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
