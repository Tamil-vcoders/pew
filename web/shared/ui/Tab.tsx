// web/shared/ui/Tab.tsx — port of docs/prototype.jsx:338-356.
// Plain text tabs on a shared bottom rule; the active tab is marked by a 2px accent underline
// (not a filled pill), matching the reference workspace design.
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
      aria-pressed={active}
      style={{
        background: "transparent",
        border: "none",
        borderBottom: `2px solid ${active ? COLORS.accent : "transparent"}`,
        // Sit on top of the tab row's 0.5px bottom rule so the underline replaces it.
        marginBottom: -0.5,
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
      {icon}
      {children}
      {dot && <span style={{ width: 7, height: 7, borderRadius: 4, background: COLORS.accent }} />}
      {count != null && (
        <span
          className="pew-mono"
          style={{
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
