// web/features/settings-global/fields.tsx — local Field/inputStyle helpers, matching the
// pattern already established in web/features/setup/SetupTab.tsx (a small copy local to each
// feature rather than a new web/shared/ui primitive — "not worth extracting yet, per small and
// additive"). Centralized once here, private to this feature, since every section component
// below needs the exact same pair.
import type { ReactNode } from "react";
import { COLORS } from "@/shared/ui";

export const inputStyle = {
  background: "#0F1116", color: COLORS.text, border: `0.5px solid ${COLORS.border}`,
  borderRadius: 6, padding: "6px 8px", fontSize: 12.5, outline: "none", width: "100%",
} as const;

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 90 }}>
      <span style={{ fontSize: 10.5, color: COLORS.faint }}>{label}</span>
      {children}
    </label>
  );
}
