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
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  dot?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? COLORS.accentDim : "transparent",
        border: `0.5px solid ${active ? COLORS.accent : "transparent"}`,
        borderRadius: 6,
        color: active ? COLORS.text : COLORS.muted,
        padding: "6px 10px",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 5,
      }}
    >
      {icon}
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
