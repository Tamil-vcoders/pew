// web/shared/ui/Btn.tsx
"use client";
import type { ButtonHTMLAttributes } from "react";
import { COLORS } from "./tokens";

type Tone = "primary" | "ghost" | "danger";

export function Btn({
  tone = "primary",
  small = false,
  title,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; small?: boolean }) {
  const toneStyle =
    tone === "danger"
      ? { background: "transparent", color: COLORS.bad, border: `0.5px solid ${COLORS.bad}55` }
      : tone === "ghost"
        ? { background: "transparent", color: COLORS.text, border: `0.5px solid ${COLORS.border}` }
        : { background: COLORS.accent, color: "#12141A", border: "none" };
  return (
    <button
      {...rest}
      title={title}
      style={{
        ...toneStyle,
        borderRadius: 7,
        padding: small ? "4px 10px" : "7px 14px",
        fontSize: small ? 12 : 13,
        fontWeight: 600,
        cursor: rest.disabled ? "default" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {children}
    </button>
  );
}
